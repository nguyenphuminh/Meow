import fs from "fs";
import readline from "readline";
import { Chess } from "chess.js";
import { evaluateBoard } from "./evaluate.js";
import { mvv_lva, PIECE_NUM } from "./evaluations.js";
import { genZobristKey } from "./zobrist.js";
import { transpositionTable } from "./transpositions.js";

let chessObj, 
    prevMove = { san: "" }, 
    ply = 0, 
    side, 
    nodes = 0, 
    debug = false, 
    train = false,
    bestScore = 0,
    globalFen = "";

const cache = transpositionTable /*{}*/; // Used for transposition table generation

// Principal variation

const pvLength = new Array(64).fill(0);
const pvTable = new Array(64).fill([]).map(() => new Array(64).fill(""));

let followPV = 0, scorePV = 0;

// Killer move constants

const killerMove = [ new Array(64).fill(null), new Array(64).fill(null) ];

// History move constants

const historyMove = {
    "b": [ {}, {}, {}, {}, {}, {} ],
    "w": [ {}, {}, {}, {}, {}, {} ]
};

// Countermove constants

const counterMove = {}; // counterMove[prevMoveAsSAN] = move;

// LMR constants

const fullDepth = 4;
const maxReduction = 3;

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

/* Spawns an absurdly high amount of nodes and I don't really know why :/
// Quiescence search

export function quiescence(alpha, beta) {
    // increment nodes count
    nodes++;

    const evaluation = evaluateBoard(chessObj, side);

    // fail-hard beta cutoff
    if (evaluation >= beta) {
        // node (move) fails high
        return beta;
    }

    // found a better move
    if (evaluation > alpha) {
        // PV node (move)
        alpha = evaluation;
    }

    let possibleMoves = chessObj.moves({ verbose: true }).filter(move => move.captured);

    possibleMoves = sortMoves(possibleMoves);

    for (const childMove of possibleMoves) {
        chessObj.move(childMove);

        ply++;

        const score = -quiescence(-beta, -alpha);

        ply--;

        chessObj.undo(); // Take back move

        // fail-hard beta cutoff
        if (score >= beta) {
            // node (move) fails high
            return beta;
        }
        
        // found a better move
        if (score > alpha) {
            // PV node (move)
            alpha = score; 
        }
    }

    return alpha;
}*/


// Negamax search with a-b pruning

export function negamax(depth, alpha, beta) {
    nodes++; // Debugging purposes

    let score = 0, searchedMoves = 0;

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

        // Write PV move
        pvTable[ply][ply] = move;

        // Next ply
        for (let nextPly = ply + 1; nextPly < pvLength[ply + 1]; nextPly++) {
            pvTable[ply][nextPly] = pvTable[ply + 1][nextPly];
        }

        pvLength[ply] = pvLength[ply + 1];
    
        return alpha;
    }

    // Null move pruning (idk if it even works or not lol)
    
    if (depth >= 3 && !chessObj.inCheck() && ply) {
        // Preserve old moves to reconstruct chess obj
        const oldMoves = chessObj.history();

        // Make null move
        let tokens = chessObj.fen().split(" ");
        tokens[1] = chessObj.turn() === "w" ? "b" : "w";
        tokens[3] = '-' // reset the en passant square
        chessObj.load(tokens.join(" "));

        // Search with reduced depth
        const score = -negamax(depth - 1 - 2, -beta, -beta + 1);

        // Reconstruct chess obj prior to null move
        chessObj.load(globalFen);
        for (const oldMove of oldMoves) {
            chessObj.move(oldMove);
        }

        // Fail-hard beta cutoff
        if (score >= beta) {
            return beta;
        }
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

    // Evaluate moves

    for (const childMove of possibleMoves) {
        const tempPrevMove = prevMove; // Preserve prev move of this depth
        prevMove = childMove; // Assign new prev move

        chessObj.move(childMove);

        ply++;

        // Late move reduction

        if (searchedMoves === 0) {
            score = -negamax(depth-1, -beta, -alpha);
        } else {
            if (
                searchedMoves >= fullDepth && 
                depth >= maxReduction && 
                !chessObj.inCheck() &&
                !childMove.captured &&
                !childMove.promotion
            ) {
                score = -negamax(depth-2, -alpha - 1, -alpha);
            } else {
                score = alpha + 1; // Magic 
            }

            // PVS
            if (score > alpha) {
                // Found better move in LMR, research at full depth with reduced score bandwidth
                score = -negamax(depth-1, -alpha - 1, -alpha);

                // If LMR fails, research at full depth and full score bandwidth
                if (score < beta) {
                    score = -negamax(depth-1, -beta, -alpha);
                }
            }
        }

        ply--;

        chessObj.undo(); // Take back move

        searchedMoves++;

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
    let alpha = -50000, beta = 50000;

    // Iterative deepening

    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
        followPV = 1; // Enable follow PV flag

        nodes = 0;

        bestScore = negamax(currentDepth, alpha, beta);

        // Aspiration window but kind of sucks
        /*
        // We fell outside the window, try again with a full-width window and the same depth

        if (bestScore <= alpha || bestScore >= beta) {
            alpha = -50000;
            beta = 50000;
            continue;
        }

        // set up window for next iteration

        alpha = bestScore - 50;
        beta = bestScore + 50;
        */

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

    globalFen = fen;

    chessObj = new Chess(fen);

    side = chessObj.turn();

    console.log(chessObj.ascii());

    const bestMove = search(4); // Can do depth 6 but pretty slow, depth 5 is fine

    console.log(bestMove);

    if (debug && train) {
        bestMove.eval = bestScore;

        cache[genZobristKey(chessObj)] = bestMove;

        fs.writeFileSync("./src/transpositions.js", "export const transpositionTable = " + JSON.stringify(cache));
    }
    
    io.close();
});
