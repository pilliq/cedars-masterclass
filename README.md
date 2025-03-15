# Cedars Masterclass

## Stage 0 - Set Up

* From URLs on screen, find 2 webpages
* In the grid, give your bear a name and a position

## Stage 1 - Simple Movements

### Unplugged
* Move 1 step at a time in 1 direction
* Move 1 step in any direction

* Only one person: find a buddy and a chair for them (sits in chair; stands up; next!)
* Multi-processor: (use chairs in centre) find a buddy and a chair -- should be must faster. But... resource contention (two people wanting the same chair); and deadlocking -- you've got a buddy but not a chair; you've got a chair but not a buddy

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

## Stage 2 - Colouring Things

### Demo
* Use keypress ("right") to move the bear and colour its square, eg, blue

### Explain RGB
* Show colour picker

### Demo
* Show different RGB values

### Demo - How to do a gradient?
* First: across 16 squares [because 16 / 16]
* Keep two colours empty; change one across its range

* Second: change more than one colour
* Pick a random colour from colour-picker; change all segments in step
* Note that some will fall off the end...

### Introduce modulo function
* Demonstrate values cycling round

### Practical: draw a square, cycling round colours
* 

## Stage 3 - using the grid squares as pixels

### Talk about pixel colours - (and throw in Steganography)

### Take a very simply picture and reproduce it, pixel by pixel
### Take a more complex picture


## Premable steps

* Allow change bear name
* Allow change bear initial position
* Add "choose" function which returns one item from a list, randomly
* Add "keypressed" function which takes desired key & function

