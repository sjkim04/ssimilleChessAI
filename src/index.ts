import readline from 'readline'
import { Chess, Move, Piece } from 'chess.js'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

let chess = new Chess()
let isStopped = false
let bestMoveOverall: { move: string; score: number } | null = null

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
        let movestogo = 30
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

        // If movetime is not specified, calculate a safe time budget
        if (!movetime) {
            if (chess.turn() === 'w' && wtime !== null) {
                movetime = Math.floor(wtime / movestogo) + winc // Simple strategy
            } else if (chess.turn() === 'b' && btime !== null) {
                movetime = Math.floor(btime / movestogo) + binc // Simple strategy
            } else {
                movetime = 1000 // default to 1 second if no info available
            }
            // Ensure a minimum time if calculated time is too low
            movetime = Math.max(movetime, 50)
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
    const startTime = Date.now()

    // Iterative deepening loop
    for (let currentDepth = 1; currentDepth <= maxDepth; currentDepth++) {
        if (isStopped || Date.now() - startTime > maxTimeMs) {
            console.log(
                'info string search stopped early due to time or stop command'
            )
            break // Exit the loop if stopped or time limit exceeded
        }

        // Pass startTime and maxTimeMs to minimax for accurate time checks
        let currentDepthBestMoves = await getBestMove(
            chess,
            currentDepth,
            startTime,
            maxTimeMs
        )

        if (isStopped || Date.now() - startTime > maxTimeMs) {
            console.log(
                'info string search stopped mid-depth due to time or stop command'
            )
            break // Exit if stopped during the current depth search
        }

        if (currentDepthBestMoves.length > 0) {
            bestMoveOverall = currentDepthBestMoves[0] // Always store the best move from the *current* completed depth
            console.log(
                `info depth ${currentDepth} score cp ${Math.round(
                    bestMoveOverall.score * 100
                )} nodes ${0} nps ${0} time ${Date.now() - startTime} pv ${
                    bestMoveOverall.move
                }`
            )
        } else {
            // No moves found at this depth (e.g., checkmate/stalemate at depth 0)
            break
        }
    }

    if (bestMoveOverall) {
        console.log(`bestmove ${bestMoveOverall.move}`)
    } else {
        // Fallback if no moves could be found (e.g., immediate checkmate/stalemate)
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

    if (depth === 0 || chess.isCheckmate() || chess.isStalemate()) {
        return {
            score: evaluateBoard(chess),
            alpha: alpha,
            beta: beta
        }
    } else {
        let setAlpha = alpha
        let setBeta = beta

        let bestScore = chess.turn() === 'w' ? -Infinity : Infinity

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

            let minimaxoutput = await minimax(
                chess,
                depth - 1,
                setAlpha,
                setBeta,
                startTime,
                maxTimeMs // Pass them down the recursion
            )
            chess.undo()

            let score = minimaxoutput.score

            if (chess.turn() === 'w') {
                bestScore = Math.max(bestScore, score)
                setAlpha = Math.max(score, setAlpha)
            } else {
                bestScore = Math.min(bestScore, score)
                setBeta = Math.min(score, setBeta)
            }

            if (setAlpha >= setBeta) {
                break // Alpha-beta cutoff
            }
        }

        return {
            score: bestScore,
            alpha: setAlpha,
            beta: setBeta
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
