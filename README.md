# Cedars Masterclass

## Premable steps

* Allow change bear name
* Allow change bear initial position
* Add "choose" function which returns one item from a list, randomly
* Add "keypressed" function which takes desired key & function

## Stage 1 - Simple Movements

### Unplugged
* Move 1 step at a time in 1 direction
* Move 1 step in any direction

### Demo
* Use keypress ("right") to move one step and then stop, then another step and stop
* Use keypress up/down/left/right to move one step in that direction

### Unplugged
* Move several steps at a time in 1 direction
* Move several steps at a time in several directions

### Demo
* USe keypress ("right") to move several steps in that direction, and then again
* Use keypress up/down/left/roght to move several steps 

### Practical
* Move one square at a time, according to keypress
* Move multiple squares at a time, according to keypress
* Program walking  a square / oblong of any size without using keypress

## Stage 2 - detecting things

### Unplugged
* Walk, looking out for a wall

### Demo
* Continue walking in one direction until wall

### Unplugged
* Walk, when reach wall, bounce back

### Demo
* Bouncing off walls, unidirectional -- need to keep current direction function as state


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


