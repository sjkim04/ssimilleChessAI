import readline from 'readline'
import { Chess, Move, Piece } from 'chess.js'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

const CHECKMATE_SCORE = 30000

let chess = new Chess()
let isStopped = false
let bestMoveOverall: { move: string; score: number } | null = null

let nodesSearched = 0

rl.on('line', (line) => {
    line = line.trim()
    if (line === 'uci') {
        console.log('id name Cimille 0.1.0')
        console.log('id author Ssimille, Phrygia')
        console.log('uciok')
    } else if (line === 'isready') {
        console.log('readyok')
    } else if (line.startsWith('position')) {
        const options = line.split(' ').slice(1)
        if (options[0] === 'fen') {
            const fen = options.slice(1, 7).join(' ')
            chess.load(fen)
            options.splice(0, 7)
        } else if (options[0] === 'startpos') {
            chess.reset()
            options.splice(0, 1)
        }

        if (options[0] === 'moves' && chess) {
            const moveList = options.slice(1)
            moveList.forEach((m) => chess.move(m))
        }
    } else if (line.startsWith('go')) {
        const tokens = line.split(' ')
        let depth = Infinity // Default to infinite depth for iterative deepening

        let wtime = null
        let btime = null
        let winc = 0
        let binc = 0
        let movestogo = null
        let movetime = null

        for (let i = 1; i < tokens.length; i++) {
            switch (tokens[i]) {
                case 'wtime':
                    wtime = parseInt(tokens[i + 1], 10)
                    i++
                    break
                case 'btime':
                    btime = parseInt(tokens[i + 1], 10)
                    i++
                    break
                case 'winc':
                    winc = parseInt(tokens[i + 1], 10)
                    i++
                    break
                case 'binc':
                    binc = parseInt(tokens[i + 1], 10)
                    i++
                    break
                case 'movestogo':
                    movestogo = parseInt(tokens[i + 1], 10)
                    i++
                    break
                case 'movetime':
                    movetime = parseInt(tokens[i + 1], 10)
                    i++
                    break
                case 'depth':
                    depth = parseInt(tokens[i + 1], 10)
                    i++
                    break
            }
        }

        const TIME_FRACTION_DIVISOR = 25 // Roughly 1/25th to 1/40th of total moves (adjust based on game length)
        const MIN_TIME_PER_MOVE_MS = 50 // Minimum time to search (50ms)
        const MAX_TIME_PER_MOVE_MS_BLITZ = 5000 // Max 5 seconds for a blitz move
        const MAX_TIME_PER_MOVE_MS_RAPID = 30000 // Max 30 seconds for a rapid move (adjust for slower games)

        if (!movetime) {
            let myTime = chess.turn() === 'w' ? wtime : btime
            let myInc = chess.turn() === 'w' ? winc : binc
            if (myTime !== null && myTime > 0) {
                if (movestogo !== null && movestogo > 0) {
                    // If movestogo is provided, use that for a more accurate fixed-move strategy
                    movetime = Math.floor(myTime / movestogo) + (myInc || 0)
                    // Add a small buffer to ensure time for sending the move
                    movetime -= 20
                } else {
                    // Otherwise, use a fraction of remaining time
                    movetime =
                        Math.floor(myTime / TIME_FRACTION_DIVISOR) +
                        (myInc || 0)

                    // Apply a hard cap to prevent excessively long searches for single moves
                    // You might make this dynamic based on 'myTime' (e.g., if myTime > 100000ms, use MAX_TIME_PER_MOVE_RAPID)
                    movetime = Math.min(movetime, MAX_TIME_PER_MOVE_MS_BLITZ)

                    // Add a small buffer for outputting the move
                    movetime -= 50 // Give a bit more buffer to be safe
                }
            } else {
                // Fallback if no time info at all (e.g., 'go infinite' or just 'go')
                movetime = 1000 // Default to 1 second
                if (depth === Infinity) depth = 6 // Cap depth if no time limit for safety
            }
        }

        searchBestMove(depth, movetime)
    } else if (line === 'stop') {
        isStopped = true
    } else if (line === 'ucinewgame') {
        chess.reset()
        isStopped = false
        bestMoveOverall = null
    } else if (line === 'quit') {
        process.exit(0)
    }
})

const searchBestMove = async (maxDepth: number, maxTimeMs: number) => {
    isStopped = false
    bestMoveOverall = null
    nodesSearched = 0
    const startTime = Date.now()

    for (let currentDepth = 1; currentDepth <= maxDepth; currentDepth++) {
        const timeElapsed = Date.now() - startTime
        const timeLeft = maxTimeMs - timeElapsed

        if (timeLeft <= 0) {
            console.log(
                `info string search stopped: time expired (before depth ${currentDepth})`
            )
            break
        }
        if (isStopped) {
            console.log(
                `info string search stopped: received stop command (before depth ${currentDepth})`
            )
            break
        }

        if (
            bestMoveOverall &&
            Math.abs(bestMoveOverall.score) >=
                CHECKMATE_SCORE - (currentDepth + 1)
        ) {
            console.log('info string stopping search early: forced mate found')
            break
        }
        const MIN_TIME_FOR_NEXT_DEPTH = 50
        if (currentDepth > 1 && timeLeft < MIN_TIME_FOR_NEXT_DEPTH) {
            console.log(
                `info string stopping search early: time critical, not enough for depth ${currentDepth}`
            )
            break
        }

        let currentDepthBestMoves = await getBestMove(
            chess,
            currentDepth,
            startTime,
            maxTimeMs
        )

        if (
            isStopped ||
            (Date.now() - startTime > maxTimeMs && maxTimeMs !== Infinity)
        ) {
            console.log(
                'info string search stopped mid-depth due to time or stop command (after depth ' +
                    currentDepth +
                    ')'
            )
            break
        }

        if (currentDepthBestMoves.length > 0) {
            bestMoveOverall = currentDepthBestMoves[0]

            const timeElapsed = Date.now() - startTime
            const nps =
                timeElapsed > 0
                    ? Math.floor(nodesSearched / (timeElapsed / 1000))
                    : 0

            let scoreString = ''

            // --- Determine UCI score format (mate or cp) ---
            if (
                Math.abs(bestMoveOverall.score) >=
                CHECKMATE_SCORE - (currentDepth + 1)
            ) {
                let movesToMate: number
                if (bestMoveOverall.score > 0) {
                    movesToMate = CHECKMATE_SCORE - bestMoveOverall.score
                } else {
                    movesToMate =
                        Math.abs(bestMoveOverall.score) - CHECKMATE_SCORE
                }
                scoreString = `score mate ${
                    bestMoveOverall.score > 0 ? movesToMate : movesToMate
                }`
            } else if (
                bestMoveOverall.score === 0 &&
                (chess.isStalemate() || chess.isDraw())
            ) {
                scoreString = `score cp 0`
            } else {
                scoreString = `score cp ${Math.round(
                    bestMoveOverall.score * 100
                )}`
            }

            console.log(
                `info depth ${currentDepth} ${scoreString} nodes ${nodesSearched} nps ${nps} time ${timeElapsed} pv ${bestMoveOverall.move}`
            )

            if (
                Math.abs(bestMoveOverall.score) >=
                CHECKMATE_SCORE - (currentDepth + 1)
            ) {
                break
            }
        } else {
            if (chess.isCheckmate() || chess.isStalemate() || chess.isDraw()) {
                let finalScoreString = ''
                if (chess.isCheckmate()) {
                    finalScoreString = `score mate ${
                        chess.turn() === 'w' ? -0 : 0
                    }`
                } else if (chess.isStalemate() || chess.isDraw()) {
                    finalScoreString = `score cp 0`
                }
                console.log(
                    `info depth ${currentDepth} ${finalScoreString} nodes 0 nps 0 time 0 pv (none)`
                )
            }
            break
        }
    }

    if (bestMoveOverall) {
        console.log(`bestmove ${bestMoveOverall.move}`)
    } else {
        const moves = chess.moves({ verbose: true })
        if (moves.length > 0) {
            const move = moves[Math.floor(Math.random() * moves.length)]
            console.log(
                `bestmove ${move.from + move.to + (move.promotion || '')}`
            )
        } else {
            console.log('info string no legal moves found, game over')
        }
    }
}

const getBestMove = async (
    chess: Chess,
    depth: number,
    startTime: number,
    maxTimeMs: number
) => {
    let legalMoves = chess.moves({ verbose: true })
    if (legalMoves.length === 0) {
        return [] // No legal moves, return empty
    }

    let scoreWithMove: { move: string; score: number }[] = []

    let setAlpha = -Infinity
    let setBeta = Infinity

    // Sort moves for better alpha-beta pruning (e.g., prioritize captures, checks)
    legalMoves = legalMoves.sort(
        (a, b) => getMoveOrderScore(chess, b) - getMoveOrderScore(chess, a)
    )

    for (let move of legalMoves) {
        // Check for stop condition before each new branch of the search tree
        if (isStopped || Date.now() - startTime > maxTimeMs) {
            return scoreWithMove // Return moves found so far if stopped
        }

        // Yield control to event loop to prevent blocking, especially for deep searches
        await new Promise((resolve) => setImmediate(resolve))

        const uciMove = move.from + move.to + (move.promotion || '')
        chess.move(uciMove)

        // Pass startTime and maxTimeMs to minimax
        let minimaxoutput = await minimax(
            chess,
            depth - 1,
            setAlpha,
            setBeta,
            startTime,
            maxTimeMs
        )
        chess.undo()

        let score = minimaxoutput.score

        if (chess.turn() === 'w') {
            setAlpha = Math.max(score, setAlpha)
        } else {
            setBeta = Math.min(score, setBeta)
        }

        let scoreobj = {
            move: uciMove,
            score
        }
        scoreWithMove.push(scoreobj)

        if (setAlpha >= setBeta) {
            // Alpha-beta cutoff
            break // Stop searching further moves at this level
        }
    }

    // Sort the moves based on score
    if (chess.turn() === 'w') scoreWithMove.sort((a, b) => b.score - a.score)
    else scoreWithMove.sort((a, b) => a.score - b.score)

    return scoreWithMove
}

const minimax = async (
    chess: Chess,
    depth: number,
    alpha = -Infinity,
    beta = Infinity,
    startTime: number, // Pass startTime to minimax
    maxTimeMs: number // Pass maxTimeMs to minimax
) => {
    if (isStopped || Date.now() - startTime > maxTimeMs) {
        // If stopped or time limit exceeded, return the current evaluation
        return { score: evaluateBoard(chess), alpha, beta }
    }

    await new Promise((resolve) => setImmediate(resolve))

    if (chess.isCheckmate()) {
        return {
            score: chess.turn() === 'b' ? CHECKMATE_SCORE : -CHECKMATE_SCORE,
            alpha: alpha,
            beta: beta
        }
    }
    if (chess.isStalemate() || chess.isDraw()) {
        return {
            score: 0,
            alpha: alpha,
            beta: beta
        }
    }
    if (depth === 0) {
        nodesSearched++
        return {
            score: evaluateBoard(chess),
            alpha: alpha,
            beta: beta
        }
    } else {
        let setAlpha = alpha
        let setBeta = beta

        let bestScore = chess.turn() === 'w' ? -Infinity : Infinity
        let bestMoveForThisNode: string | null = null

        let legalMoves = chess.moves({ verbose: true })
        legalMoves = legalMoves.sort(
            (a, b) => getMoveOrderScore(chess, b) - getMoveOrderScore(chess, a)
        )

        for (let move of legalMoves) {
            if (isStopped || Date.now() - startTime > maxTimeMs) {
                return {
                    score: evaluateBoard(chess),
                    alpha: setAlpha,
                    beta: setBeta
                }
            }

            chess.move(move)
            const childResult = await minimax(
                chess,
                depth - 1,
                setAlpha,
                setBeta,
                startTime,
                maxTimeMs
            )
            chess.undo()

            let score = childResult.score

            if (Math.abs(score) >= CHECKMATE_SCORE - (depth + 1)) {
                // Check if it's a mate score
                if (score > 0) {
                    // White's mate found (positive score)
                    score-- // Mate is one ply further away for White
                } else {
                    // Black's mate found (negative score)
                    score++ // Mate is one ply further away for Black (less negative)
                }
            }

            if (chess.turn() === 'w') {
                // Maximizing player (White)
                if (score > bestScore) {
                    bestScore = score
                    bestMoveForThisNode =
                        move.from + move.to + (move.promotion || '')
                }
                setAlpha = Math.max(setAlpha, score)
            } else {
                // Minimizing player (Black)
                if (score < bestScore) {
                    bestScore = score
                    bestMoveForThisNode =
                        move.from + move.to + (move.promotion || '')
                }
                setBeta = Math.min(setBeta, score)
            }

            if (setAlpha >= setBeta) {
                break
            }
        }

        return {
            score: bestScore,
            alpha: setAlpha,
            beta: setBeta,
            bestMove: bestMoveForThisNode
        }
    }
}

export const evaluateBoard = (chess: Chess) => {
    const currentMoves = chess.moves().length
    const flipped = new Chess(flipActiveColor(chess.fen()))
    const opponentMoves = flipped.moves().length

    let whiteMovableCount = chess.turn() === 'w' ? currentMoves : opponentMoves
    let blackMovableCount = chess.turn() === 'b' ? currentMoves : opponentMoves

    let score = 0
    let gameruleScore = 0
    let mobilityScore = whiteMovableCount - blackMovableCount

    if (chess.isCheck()) {
        gameruleScore += chess.turn() === 'b' ? 30 : -30
    }
    if (chess.isStalemate()) {
        gameruleScore += -500
    }
    if (chess.isCheckmate()) {
        return (chess.turn() === 'b' ? 1 : -1) * Infinity
    }

    const board = chess.board()
    for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 8; row++) {
            const piece = board[row][col]
            if (!piece) continue

            let pieceScore = getPieceScore(piece)
            let pstScore = getPieceSquareValue(piece, col, row) / 10

            let finalScore = pieceScore + pstScore

            score += piece.color === 'w' ? finalScore : -finalScore
        }
    }
    return score + gameruleScore + mobilityScore * 0.1
}

const flipActiveColor = (fen: string) => {
    const parts = fen.trim().split(' ')
    if (parts.length < 6) {
        throw new Error('Invalid FEN: not enough parts')
    }

    parts[1] = parts[1] === 'w' ? 'b' : 'w'
    parts[3] = '-'
    return parts.join(' ')
}

const getPieceScore = (piece: Piece) => {
    switch (piece.type) {
        case 'p':
            return 1
        case 'n':
        case 'b':
            return 3
        case 'r':
            return 5
        case 'q':
            return 9
        case 'k':
            return 0
    }
}

function getPieceSquareValue(piece: Piece, x: number, y: number) {
    const table = PST[piece.type]
    return piece.color == 'w' ? table[y][x] : table[7 - y][x] // 흑은 y 반전
}

const PST = {
    p: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [5, 5, 5, -5, -5, 5, 5, 5],
        [1, 1, 2, 3, 3, 2, 1, 1],
        [0.5, 0.5, 1, 2.5, 2.5, 1, 0.5, 0.5],
        [0, 0, 0, 2, 2, 0, 0, 0],
        [0.5, -0.5, -1, 0, 0, -1, -0.5, 0.5],
        [0.5, 1, 1, -2, -2, 1, 1, 0.5],
        [0, 0, 0, 0, 0, 0, 0, 0]
    ],

    n: [
        [-5, -4, -3, -3, -3, -3, -4, -5],
        [-4, -2, 0, 0, 0, 0, -2, -4],
        [-3, 0, 1, 1.5, 1.5, 1, 0, -3],
        [-3, 0.5, 1.5, 2, 2, 1.5, 0.5, -3],
        [-3, 0, 1.5, 2, 2, 1.5, 0, -3],
        [-3, 0.5, 1, 1.5, 1.5, 1, 0.5, -3],
        [-4, -2, 0, 0.5, 0.5, 0, -2, -4],
        [-5, -4, -3, -3, -3, -3, -4, -5]
    ],

    b: [
        [-2, -1, -1, -1, -1, -1, -1, -2],
        [-1, 0, 0, 0, 0, 0, 0, -1],
        [-1, 0, 0.5, 1, 1, 0.5, 0, -1],
        [-1, 0.5, 0.5, 1, 1, 0.5, 0.5, -1],
        [-1, 0, 1, 1, 1, 1, 0, -1],
        [-1, 1, 1, 1, 1, 1, 1, -1],
        [-1, 0.5, 0, 0, 0, 0, 0.5, -1],
        [-2, -1, -1, -1, -1, -1, -1, -2]
    ],

    r: [
        [0, 0, 0, 0.5, 0.5, 0, 0, 0],
        [-0.5, 0, 0, 0, 0, 0, 0, -0.5],
        [-0.5, 0, 0, 0, 0, 0, 0, -0.5],
        [-0.5, 0, 0, 0, 0, 0, 0, -0.5],
        [-0.5, 0, 0, 0, 0, 0, 0, -0.5],
        [-0.5, 0, 0, 0, 0, 0, 0, -0.5],
        [0.5, 1, 1, 1, 1, 1, 1, 0.5],
        [0, 0, 0, 0, 0, 0, 0, 0]
    ],

    q: [
        [-2, -1, -1, -0.5, -0.5, -1, -1, -2],
        [-1, 0, 0, 0, 0, 0, 0, -1],
        [-1, 0, 0.5, 0.5, 0.5, 0.5, 0, -1],
        [-0.5, 0, 0.5, 0.5, 0.5, 0.5, 0, -0.5],
        [0, 0, 0.5, 0.5, 0.5, 0.5, 0, -0.5],
        [-1, 0.5, 0.5, 0.5, 0.5, 0.5, 0, -1],
        [-1, 0, 0.5, 0, 0, 0, 0, -1],
        [-2, -1, -1, -0.5, -0.5, -1, -1, -2]
    ],

    k: [
        [-3, -4, -4, -5, -5, -4, -4, -3],
        [-3, -4, -4, -5, -5, -4, -4, -3],
        [-3, -4, -4, -5, -5, -4, -4, -3],
        [-3, -4, -4, -5, -5, -4, -4, -3],
        [-2, -3, -3, -4, -4, -3, -3, -2],
        [-1, -2, -2, -2, -2, -2, -2, -1],
        [2, 2, 0, 0, 0, 0, 2, 2],
        [2, 3, 1, 0, 0, 1, 3, 2]
    ]
}

const getCaptureScore = (move: Move): number => {
    // colors are placeholder
    const victimScore = getPieceScore({ type: move.captured, color: 'w' }) || 0
    const attackerScore = getPieceScore({ type: move.piece, color: 'w' }) || 0
    return victimScore * 10 - attackerScore
}

const getMoveOrderScore = (chess: Chess, move: Move): number => {
    let score = 0

    // Prioritize captures using MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
    if (move.captured) {
        score += getCaptureScore(move) + 1000
    }

    // Prioritize checks
    const test = new Chess(chess.fen())
    test.move(move)
    if (test.inCheck()) {
        score += 500
    }

    // Promote moves get a bonus
    if (move.promotion) {
        score += 300
    }

    return score
}
