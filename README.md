## The Meow chess engine

Meow...?


## Dependencies 

* Node.js & npm


## Setup

1. Clone the repository to your machine.

2. Go to `./Meow/`, install the packages:
```
npm install
```

3. Fire up Meow!

```
node .
```

## What do we currently have?

### The engine

* Negamax search algorithm with Alpha-Beta pruning.
* Iterative deepening.
* Principal variation search.
* Null-move pruning.
* Move ordering:
	* PV moves.
	* MVV-LVA heuristic.
	* Killer heuristic.
	* History heuristic.
	* Countermove heuristic.
* Transposition table.
* Late move reduction.
* Checkmate and stalemate detection.
* Quiescence search (disabled).
* Aspiration window (disabled).
* Evalution:
	* Piece-Square table.

### Others

* A simple and not-that-intuitive console application that takes a FEN value and returns a move.


## How strong is it?

After some testing, it completely out-performs ~1200 elo chess bots on chess.com early game and mid-game, but does not know how to deliver a proper checkmate.


## Copyrights

Copyrights © 2023 Nguyen Phu Minh.

This project is licensed under the GPL-3.0 License.
