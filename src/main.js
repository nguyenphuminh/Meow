import readline from "readline";
import { Chess } from "chess.js";
import { evaluateBoard } from "./evaluate.js";
import { mvv_lva, PIECE, PIECE_NUM } from "./evaluations.js";

let chessObj, bestMove, prevMove = { lan: "" }, ply = 0, side, nodes = 0;

const killerMove = (new Array(2)).fill(new Array(64).fill(null));

const historyMove = {
    "b": (new Array(6)).fill({}),
    "w": (new Array(6)).fill({})
};

const counterMove = {}; // counterMove[prevMoveAsLAN] = move;

// Move ordering

export function scoreMove(move) {
    // Killer heuristic and history heuristic

    if (!move.captured) {
        // 1st killer move
        if (killerMove[0][ply] && killerMove[0][ply].lan === move.lan) { 
            move.score += 9000; 
        }

        // 2nd killer move
        else if (killerMove[1][ply] && killerMove[1][ply].lan === move.lan) {
            move.score += 8000;
        }

        // Counter move
        if (counterMove[prevMove.lan] && counterMove[prevMove.lan].lan === move.lan) {
            move.score += 9000;
        }

        // History move
        move.score += historyMove[move.color][PIECE_NUM[move.piece]][move.to] || 0;
        
        return;
    }

    // MVV-LVA heuristic

    const attacker = move.piece;
    const victim = move.captured;

    move.score += mvv_lva[ PIECE_NUM[attacker] ][ PIECE_NUM[victim] ];
}

export function sortMoves(moveList) {
    for (const move of moveList) {
        move.score = 0;

        scoreMove(move);
    }

    return moveList.sort((moveA, moveB) => moveB.score - moveA.score);
}


// Negamax search with a-b pruning

export function negamax(depth, alpha, beta) {
    // nodes++; Debugging purposes

    if (depth === 0) return evaluateBoard(chessObj, side);

    let oldAlpha = alpha, bestSoFar;

    // Get next moves

    const possibleMoves = sortMoves(chessObj.moves({ verbose: true }));

    // Detecting checkmates and stalemates
    
    if (possibleMoves.length === 0) {    
        if (chessObj.inCheck()) {
            return -50000 + ply; // Checkmate

            // Ply is added because:
            // - In our checkmate, we would want the furthest path to checkmate
            // - In their checkmate, we would want the shortest path to checkmate
            
            // The equation above also turns out to work well with negamax :v
        }

        return 0; // Stalemate
    }

    // Evaluate child moves

    for (const childMove of possibleMoves) {
        const tempPrevMove = prevMove; // Preserve prev move of this depth
        prevMove = childMove; // Assign new prev move

        chessObj.move(childMove);

        ply++;

        const score = -negamax(depth-1, -beta, -alpha);

        ply--;

        chessObj.undo(); // Take back move

        prevMove = tempPrevMove; // Get prev move of this depth

        // Fail-hard beta cutoff

        if (score >= beta) {
            if (!childMove.captured) { // Only quiet moves
                // Store killer moves
                
                killerMove[1][ply] = killerMove[0][ply];
                killerMove[0][ply] = childMove;

                // Store counter moves
                counterMove[prevMove.lan] = childMove;
            }

            // move fails high
            return beta;
        }

        // Found better move

        if (score > alpha) {
            // Store history moves

            if (!childMove.captured) { // Only quiet moves
                historyMove[childMove.color][PIECE_NUM[childMove.piece]][childMove.to] += depth;
            }

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

    // For debugging purposes
    // console.log(nodes);

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

    console.log(search(4)); // Can do depth 5
});
