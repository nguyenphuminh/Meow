import { PIECE_NUM } from "./evaluations.js";
import { hashTable } from "./hashtable.js";

export const castleHash = [ 
    6198902673774522041n /* Black king side */,
    1480730827862534555n /* Black queen side */,
    911285688771276305n /* White king side */,
    11307063483952278012n /* White queen side */,
];

export const side = [
    2456283173818682857n /* Black to move */,
    9381995726543095291n /* White to move */
]

export function genZobristKey(chessObj) {
    const board = chessObj.board();

    let hash = 0n;

    // Hash pieces' positions

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            if (board[x][y] === null) continue;

            const piece = board[x][y].type;
            const pieceNum = PIECE_NUM[piece];   
            
            hash ^= hashTable[pieceNum][x][y];
        }
    }

    // Hash castling rights

    const castlingRights = chessObj.fen().split(" ")[2];

    if (castlingRights.includes("k")) { hash ^= castleHash[0]; }
    if (castlingRights.includes("q")) { hash ^= castleHash[1]; }
    if (castlingRights.includes("K")) { hash ^= castleHash[2]; }
    if (castlingRights.includes("Q")) { hash ^= castleHash[3]; }

    // Hash side

    hash ^= chessObj.turn() === "b" ? side[0] : side[1];

    return hash;
}
