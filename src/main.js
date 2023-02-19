import readline from "readline";
import { Chess } from "chess.js";
import { evaluateBoard } from "./evaluate.js";
import { mvv_lva, PIECE_NUM } from "./evaluations.js";

let chessObj, bestMove, ply = 0, side;

// MVV-LVA heuristic

export function scoreMove(move) {
    if (!move.captured) return 0;

    const attacker = move.piece;
    const victim = move.captured;

    return mvv_lva[ PIECE_NUM[attacker] ][ PIECE_NUM[victim] ];
}

export function sortMoves(moveList) {
    for (const move of moveList) {
        move.score = scoreMove(move);
    }

    return moveList.sort((moveA, moveB) => moveB.score - moveA.score);
}


// Negamax search with a-b pruning

export function negamax(depth, alpha, beta) {
    if (depth === 0) return evaluateBoard(chessObj, side);

    let oldAlpha = alpha, bestSoFar;

    // Get next moves

    const possibleMoves = sortMoves(chessObj.moves({ verbose: true }));

    // Detecting checkmates and stalemates
    
    if (possibleMoves.length === 0) {
        if (chessObj.inCheck()) {
            if (chessObj.turn() === side) { 
                return -50000 + ply; // Checkmate, ply is added because we would want the furthest route to our checkmate
            } else {
                return 50000 - ply; // ply is subtracted because we would want the closest route to opponent's checkmate
            }
        } 

        return 0; // Stalemate
    }

    // Evaluate child moves

    for (const childMove of possibleMoves) {
        chessObj.move(childMove);

        ply++;

        const score = -negamax(depth-1, -beta, -alpha);

        ply--;

        chessObj.undo(); // Take back

        // Fail-hard beta cutoff

        if (score >= beta) return beta;

        // Found better move

        if (score > alpha) {
            alpha = score;

            if (ply === 0) {
                bestSoFar = childMove;
            }
        }
    }

    // Best move

    if (oldAlpha !== alpha) {
        bestMove = bestSoFar;
    }

    return alpha;
}


export function search(depth = 4) {
    negamax(depth, -50000, 50000);

    return bestMove;
}


const io = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

io.question("Enter FEN value: ", fen => {
    chessObj = new Chess(fen);

    side = chessObj.turn();

    console.log(chessObj.ascii());

    console.log(search(4));

    io.close();
});
