import fs from "fs";
import readline from "readline";
import { Chess } from "chess.js";
import { evaluateBoard } from "./evaluate.js";
import { mvv_lva, PIECE, PIECE_NUM } from "./evaluations.js";
import { genZobristKey } from "./zobrist.js";
import { transpositionTable } from "./transpositions.js";

let chessObj, 
    prevMove = { san: "" }, 
    ply = 0, 
    side, 
    nodes = 0, 
    debug = false, 
    train = false,
    bestScore = 0;

const cache = transpositionTable; // Used for transposition table generation

const pvLength = new Array(64).fill(0);
const pvTable = new Array(64).fill([]).map(() => new Array(64).fill(""));

let followPV = 0, scorePV = 0;

const killerMove = [ new Array(64).fill(null), new Array(64).fill(null) ];

const historyMove = {
    "b": [ {}, {}, {}, {}, {}, {} ],
    "w": [ {}, {}, {}, {}, {}, {} ]
};

const counterMove = {}; // counterMove[prevMoveAsSAN] = move;

// Move ordering

export function scoreMove(move) {
    // Killer heuristic and history heuristic

    
    if (scorePV) {
        if (pvTable[0][ply].lan == move.lan) { // Only pv move
            // Disable pv move scoring

            scorePV = 0;
            
            move.score += 20000;
        }
    }

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

export function enablePVScoring(moveList) {
    followPV = 0; // Disable pv move following

    for (const move of moveList) {
        if (pvTable[0][ply].lan == move.lan) {
            // Enable PV move scoring
            scorePV = 1;

            // Enable next PV move following
            followPV = 1;
        }
    }
}


// Negamax search with a-b pruning

export function negamax(depth, alpha, beta) {
    nodes++; // Debugging purposes

    let foundPV = 0, score = 0;

    // Init PV length
    pvLength[ply] = ply;

    if (depth === 0) return evaluateBoard(chessObj, side);

    // Check transpositions

    const hash = genZobristKey(chessObj);
    const move = cache[hash];

    if (move && !train) {
        const score = move.eval;

        // Fail-hard beta cutoff

        if (score >= beta) {
            if (!move.captured) { // Only quiet moves
                // Store killer moves
                
                killerMove[1][ply] = killerMove[0][ply];
                killerMove[0][ply] = move;

                // Store counter moves
                counterMove[prevMove.lan] = move;
            }

            // move fails high
            return beta;
        }

        if (!move.captured) { // Only quiet moves
            historyMove[move.color][PIECE_NUM[move.piece]][move.to] += depth;
        }

        // PV move
        alpha = score;

        // Enable found PV flag
        foundPV = 1;

        // Write PV move
        pvTable[ply][ply] = move;

        // Next ply
        for (let nextPly = ply + 1; nextPly < pvLength[ply + 1]; nextPly++) {
            pvTable[ply][nextPly] = pvTable[ply + 1][nextPly];
        }

        pvLength[ply] = pvLength[ply + 1];
    
        return alpha;
    }

    // Get next moves if position does not have an existing best move

    let possibleMoves = chessObj.moves({ verbose: true });

    if (followPV) {
        enablePVScoring(possibleMoves);
    }

    possibleMoves = sortMoves(possibleMoves);

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

        if (foundPV) {
            score = -negamax(depth - 1, -alpha - 1, -alpha);

            if ((score > alpha) && (score < beta)) {
                score = -negamax(depth-1, -beta, -alpha);
            }
        } else {
            score = -negamax(depth-1, -beta, -alpha);
        }

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

            // PV move
            alpha = score;

            // Enable found PV flag

            foundPV = 1;

            // Write PV move
            pvTable[ply][ply] = childMove;

            // Next ply

            for (let nextPly = ply + 1; nextPly < pvLength[ply + 1]; nextPly++) {
                pvTable[ply][nextPly] = pvTable[ply + 1][nextPly];
            }

            pvLength[ply] = pvLength[ply + 1];
        }
    }

    return alpha;
}


export function search(depth = 4) {
    // Iterative deepening

    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
        followPV = 1; // Enable follow PV flag

        nodes = 0;

        bestScore = negamax(currentDepth, -50000, 50000);

        // For debugging purposes
        if (debug) { 
            process.stdout.write("PV moves: ");

            for (let count = 0; count < pvLength[0]; count++) {
                process.stdout.write(pvTable[0][count].lan + " ");
            }

            console.log("\nNodes searched:", nodes);
            console.log("Evaluation:", bestScore);
        }
    }

    return pvTable[0][0];
}


const io = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


io.question("Enter FEN value: ", fen => {
    // Uncomment to enable debugging mode
    debug = true;
    // Uncomment to enable training mode (generate moves for transposition table)
    // train = true;

    chessObj = new Chess(fen);

    side = chessObj.turn();

    console.log(chessObj.ascii());

    const bestMove = search(4);

    console.log(bestMove);

    if (debug && train) {
        bestMove.eval = bestScore;

        cache[genZobristKey(chessObj)] = bestMove;

        fs.writeFileSync("./src/transpositions.js", "export const transpositionTable = " + JSON.stringify(cache));
    }
    
    io.close();
});
