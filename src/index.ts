import readline from 'readline'
import 'chess.js'
import { Chess, Piece } from 'chess.js'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
})

let chess = new Chess()
let isStopped = false

rl.on('line', (line) => {
    line = line.trim()
    if (line === 'uci') {
        console.log('id name Cimille 0.1.0')
        console.log('id author Ssimille, Phrygia')
        console.log('uciok')
    } else if (line === 'isready') {
        console.log('readyok')
    } else if (line.startsWith('position')) {
        // Handle position command
        // Example: position startpos moves e2e4 e7e5
        // TODO: parse and update your internal board representation here
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
        let depth = 3 // default depth

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

        // If movetime is not specified, calculate a safe time budget based on remaining time and increments
        if (!movetime) {
            // Determine whose turn it is to move
            if (chess.turn() === 'w' && wtime > 0) {
                // Use 30% of remaining time plus increment
                movetime = Math.floor(wtime * 0.3) + winc
            } else if (chess.turn() === 'b' && btime > 0) {
                movetime = Math.floor(btime * 0.3) + binc
            } else {
                // default to 1 second if no info available
                movetime = 1000
            }
        }

        searchBestMove(depth, movetime)
    } else if (line === 'stop') {
        isStopped = true
    } else if (line === 'ucinewgame') {
        chess.reset()
        isStopped = false
    } else if (line === 'quit') {
        process.exit(0)
    }
})

const searchBestMove = async (depth: number, maxTimeMs: number) => {
    isStopped = false
    const startTime = Date.now()

    const timer = setTimeout(() => {
        isStopped = true
    }, maxTimeMs)

    let bestMoves = await getBestMove(chess, depth, startTime, maxTimeMs)

    clearTimeout(timer)

    console.log(
        `info bestmoves ${bestMoves
            .slice(0, 4)
            .map((m) => `${m.move} ${Math.round(m.score * 100) / 100}`)
            .join(' ')}`
    )

    if (bestMoves.length > 0) {
        console.log(`bestmove ${bestMoves[0].move}`)
    } else {
        const moves = chess.moves({ verbose: true })
        const move = moves[Math.floor(Math.random() * moves.length)]

        console.log(`bestmove ${move.from + move.to + (move.promotion || '')}`)
    }
}

const getBestMove = async (
    chess: Chess,
    depth: number,
    startTime: number,
    maxTimeMs: number
) => {
    let legalMoves = chess.moves({ verbose: true })

    let scoreWithMove = [] //이 안에는 어디있던 말이 어디로 이동했고 그때 총 점수가 몇인지가 담긴 오브젝트 여러개가 배열로 존재한다

    let setAlpha = -Infinity
    let setBeta = Infinity

    let bestScore = chess.turn() === 'w' ? -Infinity : Infinity

    //미니맥스를 돌리기 위한 for문; 모든 판에 대해 미니맥스를 실행해 점수 출력
    for (let move of legalMoves) {
        if (isStopped || Date.now() - startTime > maxTimeMs) {
            console.log('info string search stopped early')
            break
        }

        await new Promise((resolve) => setImmediate(resolve))

        const uciMove = move.from + move.to + (move.promotion || '')
        chess.move(uciMove)

        let minimaxoutput = await minimax(chess, depth, setAlpha, setBeta) //입력받은 가상 SimulateGame 클래스를 통해 미니맥스를 진행하여 점수를 뽑는다.

        chess.undo()

        let score = minimaxoutput.score

        if (chess.turn() === 'w') {
            bestScore = Math.max(bestScore, score)
            setAlpha = Math.max(score, setAlpha)
        } else {
            bestScore = Math.min(bestScore, score)
            setBeta = Math.min(score, setBeta)
        }

        let scoreobj = {
            move: uciMove,
            score
        }

        scoreWithMove.push(scoreobj)

        if (setAlpha >= setBeta) {
            if (chess.turn() === 'w')
                scoreWithMove = scoreWithMove.sort((a, b) => b.score - a.score)
            else scoreWithMove = scoreWithMove.sort((a, b) => a.score - b.score)

            return scoreWithMove
        }
    }

    if (chess.turn() === 'w')
        scoreWithMove = scoreWithMove.sort((a, b) => b.score - a.score)
    else scoreWithMove = scoreWithMove.sort((a, b) => a.score - b.score)

    return scoreWithMove //일단 어디로 갈지 정제되지 않은 다음 모든 위치와 그에 따른 점수가 담긴 배열을 출력
}

const minimax = async (
    chess: Chess,
    depth: number,
    alpha = -Infinity,
    beta = Infinity,
    startTime?: number,
    maxTimeMs?: number
) => {
    if (isStopped) {
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
        //깊이가 0이 아니라면
        let setAlpha = alpha
        let setBeta = beta

        //자기 차례면 최대를 구하기 위해 -무한에서, 적 차례면 최소를 구하기 위해 무한에서
        let bestScore = chess.turn() === 'w' ? -Infinity : Infinity

        let legalMoves = chess.moves()

        if (chess.turn() === 'w') {
            for (let move of legalMoves) {
                if (
                    isStopped ||
                    (startTime &&
                        maxTimeMs &&
                        Date.now() - startTime > maxTimeMs)
                ) {
                    return {
                        score: evaluateBoard(chess),
                        alpha: alpha,
                        beta: beta
                    }
                }

                chess.move(move) //그 위치로 이동한 가상 체스판

                let minimaxoutput = await minimax(
                    chess,
                    depth - 1,
                    setAlpha,
                    setBeta
                ) //입력받은 가상 SimulateGame 클래스를 통해 미니맥스를 진행하여 점수를 뽑는다.
                chess.undo()

                let score = minimaxoutput.score

                bestScore = Math.max(bestScore, score)

                setAlpha = Math.max(score, setAlpha)

                if (setAlpha >= setBeta) {
                    return {
                        score: bestScore,
                        alpha: setAlpha,
                        beta: setBeta
                    }
                }
            }
        } else if (chess.turn() === 'b') {
            //현재가 적의 턴이면
            //다음 턴에선 아군 => 낸 수 중에서 점수가 최악인 걸 골라내야함 (그래야 나에게 안좋음)
            for (let move of legalMoves) {
                if (
                    isStopped ||
                    (startTime &&
                        maxTimeMs &&
                        Date.now() - startTime > maxTimeMs)
                ) {
                    return { score: evaluateBoard(chess), alpha, beta }
                }

                chess.move(move)

                let minimaxoutput = await minimax(
                    chess,
                    depth - 1,
                    setAlpha,
                    setBeta
                ) //입력받은 가상 SimulateGame 클래스를 통해 미니맥스를 진행하여 점수를 뽑는다.
                chess.undo()

                let score = minimaxoutput.score

                bestScore = Math.min(bestScore, score)

                setBeta = Math.min(score, setBeta)

                if (setAlpha >= setBeta) {
                    return {
                        score: bestScore,
                        alpha: setAlpha,
                        beta: setBeta
                    }
                }
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
        //현재가 스테일메이트일 때
        gameruleScore += -500
    }
    if (chess.isCheckmate()) {
        //현재 턴인 팀이 체크메이트일 때
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
    // for (let col = 0; col < 8; col++) {
    //     for (let row = 0; row < 8; row++) {
    //         const piece = board[col][row]
    //         if (!piece) continue

    //         let pieceScore = piece.score //기물 자체 점수
    //         let pstScore = getPieceSquareValue(piece, col, row) / 10 //기물의 위치 가중치

    //         let finalScore = pieceScore + pstScore

    //         score += team == piece.team ? finalScore : -finalScore //팀에 따라 부호 변경
    //     }
    // }
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
