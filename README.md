* Allow change bear name
* Allow change bear initial position
* Add "choose" function which returns one item from a list, randomly
* Add "keypressed" function which takes desired key & function

* Unplugged: move 1 step at a time in 1 direction
* Unplugged: move 1 step in any direction
* Demo of same

* Unplugged: move several steps at a time in 1 direction
* Unplugged: move several steps at a time in several directions
* Demo: move several steps

* Practical: 
* Move one square at a time, according to keypress
* Move multiple squares at a time, according to keypress
* Walk a square / oblong of any size

* Unplugged: walk, looking out for a wall
* Demo: continue walking in one direction until wall
* Unplugged: walk, when reach wall, bounce back
* Demo: bouncing off walls, unidirectional

Concept of state -- knowing which way we're walking
* Unplugged: walk right, changing direction through 90 degrees when next to a wall, ie walking along the wall until reach another wall, then turn again. [NB turn means deciding what new direction to walk in...]
* Demo: When reach wall: if going up/down, look left/right; if going left/right, look up/down

* Practical:
* Draw a closed room in debug room
* Programatically position bear in the room
* Let step = moveRight
* Walk right until reach wall and bounce left; same in reverse
* if (step === moveRight) {step = moveLeft;}
* else if (step === moveLeft) {step = moveRight;}
* else if etc


