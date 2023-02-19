import { PIECE, NAME } from "./evaluations.js";

export function evaluatePiece(piece) {
    const pieceName = NAME[piece];
    const pieceEval = PIECE[pieceName].CAPTURE;

    return pieceEval;
}

export function evaluateBoard(chessObj, side = "b") {
    const board = chessObj.board();

    let boardEval = 0;

    for (let x = 0; x < board.length; x++) {
        for (let y = 0; y < board[x].length; y++) {
            if (board[x][y] === null) continue;

            const piece = board[x][y].type;
            const pieceName = NAME[piece];
            
            if (board[x][y].color === "b") {
                if (side === "b") {
                    boardEval += evaluatePiece(piece) + PIECE[pieceName].BPOSITION[x][y];
                } else {
                    boardEval -= evaluatePiece(piece) + PIECE[pieceName].BPOSITION[x][y];
                }
            } else {
                if (side === "w") {
                    boardEval += evaluatePiece(piece) + PIECE[pieceName].POSITION[x][y];
                } else {
                    boardEval -= evaluatePiece(piece) + PIECE[pieceName].POSITION[x][y];
                }
            }
        }
    }

    return boardEval;
}
