import { forwardRef, useEffect, useState, useRef, useImperativeHandle } from 'react'
import indefiniteArticle from './indefinite-article'
import * as idUtils from './id'
import * as d3 from 'd3'

const cellSize = 20

const DEBUG = 1
const EMPTY = 0, WALL = 1, DOOR = 2;
const ROOM_MIN_SIZE = 4, ROOM_MAX_SIZE = 6;
const MAX_ROOM_TRIES = 10;
const MAX_PATH_TRIES = 10;
const ANIM_PATH_STEP_DUR = 50 // in ms

// red-roofed-house consts
const RRH_MAX_WIDTH = 4 // units is # of cells
const RRH_MAX_HEIGHT = 4

// database consts
const DB_MAX_WIDTH = 2 // units is # of cells
const DB_MAX_HEIGHT = 2

const BEAR_NAME_FONT_SIZE = 12
const bearNames = [
  'Smokey',
  'Yogi',
  //'Paddington',
  'Winnie',
  'Teddy',
  //'Ted',
  //'Ursula',
]
const imposterNames = [
  'Pat',
  'John',
  'Max',
  'Rex',
]

const MARKER_COLOR = '#f00'

function titleCase(phrase) {
  if (!phrase) {
    return phrase
  }
  return `${phrase[0].toUpperCase()}${phrase.substring(1)}`
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function isValidCell(grid, row, col) {
  return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length
}

function isValidRoomPosition(grid, startRow, startCol, width, height) {
  for (let r = startRow - 1; r <= startRow + height; r++) {
    for (let c = startCol - 1; c <= startCol + width; c++) {
      if (isValidCell(grid, r, c) && grid[r][c] !== EMPTY) {
        return false;
      }
    }
  }
  return true;
}

function canAddDoor(grid, row, col) {
  const adjacentCells = [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
  ];

  return adjacentCells.some(([r, c]) =>
    isValidCell(grid, r, c) && grid[r][c] === EMPTY
  )
}

function addDoors(grid, room, startRow, startCol, width, height) {
  const sides = [
    {row: startRow, col: startCol + randomInt(1, width - 2)},             // Top
    {row: startRow + height - 1, col: startCol + randomInt(1, width - 2)},// Bottom
    {row: startRow + randomInt(1, height - 2), col: startCol},            // Left
    {row: startRow + randomInt(1, height - 2), col: startCol + width - 1} // Right
  ];

  const doors = []
  sides.forEach(side => {
    if (canAddDoor(grid, side.row, side.col)) {
      doors.push({ row: side.row, col: side.col })
    }
  });

  return doors
}

function isImposter(d) {
  return d.type === 'imposter'
}

function findByID(id, data) {
  for (let i = 0; i < data.length; i++) {
    if (data[i].id === id) {
      return data[i]
    }
  }
  return null
}

const finders = [
  ['houses', idUtils.isHouseID],
  ['bears', idUtils.isBearID],
  ['honeypots', idUtils.isHoneypotID],
  ['databases', idUtils.isDBID],
  ['connections', idUtils.isConnID],
]

// returns a thing by it's id. if not found, returns null
function searchByID(id, state) {
  for (let i = 0; i < finders.length; i++) {
    if (finders[i][1](id)) {
      return findByID(id, state[finders[i][0]])
    }
  }
}

function shouldShowBearLabels(showBearLabels, datum, i) {
  if (typeof showBearLabels === 'function') {
    return showBearLabels(datum, i)
  }
  return showBearLabels // booleans and other things
}

// returns connection between aId and bId if found. src/dst direction does not matter
function findConnection(state, aId, bId) {
  const conn = state.connections.find(c => {
    const parsed = idUtils.parseConnID(c.id)
    if (!parsed) {
      return false
    }
    const { srcId, dstId } = parsed
    return (srcId === aId || dstId === aId) && (srcId === bId || dstId === bId)
  })
  return conn
}

export function generateConnection(src, dst) {
  const srcStr = typeof src === 'string' ? src : src?.id
  const dstStr = typeof dst === 'string' ? dst : dst?.id

  if (!srcStr || !dstStr) {
    throw new Error('Invalid src or dst for connection:', src, dst)
  }

  return {
    id: idUtils.newConnID(srcStr, dstStr),
    src,
    dst,
  }
}

export function generateHoneypot(state) {
  const { grid } = state
  // add honeypot, and position in inside a random room (ideally the kitchen or the pantry), else, just place it in a random position
  let row, col;

  const kitchen = roomByName(state, 'kitchen')
  if (kitchen) {
    // generate in kitchen
    const emptyCell = findEmptyCellInRoom(state, kitchen)
    if (emptyCell) {
      row = emptyCell[0]
      col = emptyCell[1]
    }
  }

  if (!kitchen || (!row && !col)) { // if we're not able to place the honey in the kitchen, place it in a random position
    let newRow, newCol;
    do {
      [newRow, newCol] = getRandomGridPosition(grid)
    } while (grid[newRow][newCol] !== EMPTY) // TODO make sure the position is not in any room || !isPositionInAnyRoom(newRow, newCol))
    row = newRow
    col = newCol
  }

  return {
    id: `honeypot-${Date.now()}-${row}-${col}`,
    name,
    pos: { row, col },
  }
}

export function newBear({ type, name, pos={}, hunger, movement, target }) {
  let newRow = 1, newCol = 1
  if (typeof pos.row === 'number') {
    newRow = pos.row
  }
  if (typeof pos.col === 'number') {
    newCol = pos.col
  }

  let newHunger = hunger
  if (typeof newHunger !== 'number') {
    const isHungry = Math.random() < 0.2 // 20% chance of hunger
    newHunger = isHungry ? randomInt(1, 5) : 0 // generate random hunger level between 1 and 5
  }

  let bearName = name
  if (!bearName) {
    if (type === 'imposter') {
      bearName = imposterNames[randomInt(0, imposterNames.length-1)]
    } else { // user type
      bearName = bearNames[randomInt(0, bearNames.length-1)]
    }
  }

  return {
    id: `bear-${Date.now()}-${newRow}-${newCol}`,
    type: type ? type : 'user', // type is used for the bear label and naming if no name provided
    name: bearName,
    pos: { row: newRow, col: newCol },
    hunger: newHunger,
    movement, // 'controlled' if externally controlled, or empty if bear is just wandering around
    target, // the target object this bear is moving to; optional
  }
}

export function generateBear(grid, bearOpts) {
  // add bear, and position in random periphery (non-room)
  // TODO make sure bear is not placed in any room or house
  let [newRow, newCol] = getRandomStandingPosition(grid)

  return newBear({ pos: { row: newRow, col: newCol }, ...bearOpts })
}

export function generateRoom(grid, name) {
  const width = randomInt(ROOM_MIN_SIZE, ROOM_MAX_SIZE)
  const height = randomInt(ROOM_MIN_SIZE, ROOM_MAX_SIZE)
  let startRow, startCol;

  // Find a valid starting position for the new room
  let tries = 0
  do {
    startRow = randomInt(0, grid.length - height);
    startCol = randomInt(0, grid[0].length - width);
    tries++
  } while (!isValidRoomPosition(grid, startRow, startCol, width, height) && tries < MAX_ROOM_TRIES);

  if (tries >= MAX_ROOM_TRIES) {
    console.log('Could not find a place for the new room!')
    return
  }

  const room = []
  // Create the room
  for (let r = startRow; r < startRow + height; r++) {
    for (let c = startCol; c < startCol + width; c++) {
      if (r === startRow || r === startRow + height - 1 || c === startCol || c === startCol + width - 1) {
        room.push([r, c, WALL])
      } else {
        // empty space
      }
    }
  }

  // Add doors
  const doors = addDoors(grid, room, startRow, startCol, width, height);

  return { name, startRow, startCol, width, height, doors }
}

function renderDatabase(grid, database) {
  const nextGrid = structuredClone(grid)
  const { row, col } = database.pos

  for (let r = row; r < row + DB_MAX_HEIGHT; r++) {
    for (let c = col; c < col + DB_MAX_WIDTH; c++) {
      if (r === row || r === row + DB_MAX_HEIGHT - 1 || c === col || c === col + DB_MAX_WIDTH - 1) {
        nextGrid[r][c] = WALL
      } else {
        nextGrid[r][c] = EMPTY
      }
    }
  }

  return nextGrid
}

// returns the coordinates of the door of a red-roofed-house
export function houseDoorCoords(house) {
  if (!house) {
    return null
  }
  // position (4,3)
  return { row: house.pos.row + RRH_MAX_HEIGHT-1, col: house.pos.col + RRH_MAX_WIDTH-2 }
}

// renders the footprint of a red-roofed-house
function renderHouse(grid, house) {
  const nextGrid = structuredClone(grid)
  const { row, col } = house.pos

  // for a red-roofed-house, the span of the house is 4 x 4 with a door at (4, 3)
  for (let r = row; r < row + RRH_MAX_HEIGHT; r++) {
    for (let c = col; c < col + RRH_MAX_WIDTH; c++) {
      if (r === row || r === row + RRH_MAX_HEIGHT - 1 || c === col || c === col + RRH_MAX_WIDTH - 1) {
        nextGrid[r][c] = WALL
      } else {
        nextGrid[r][c] = EMPTY
      }
    }
  }

  const doorCoords = houseDoorCoords(house)
  nextGrid[doorCoords.row][doorCoords.col] = DOOR

  return nextGrid
}

// assumes given room is valid for grid (e.g. does not overlap with existing rooms)
function renderRoom(grid, room) {
  const nextGrid = structuredClone(grid)
  const { startRow, startCol, width, height, doors } = room

  // Render room
  for (let r = startRow; r < startRow + height; r++) {
    for (let c = startCol; c < startCol + width; c++) {
      if (r === startRow || r === startRow + height - 1 || c === startCol || c === startCol + width - 1) {
        nextGrid[r][c] = WALL
      } else {
        nextGrid[r][c] = EMPTY;
      }
    }
  }

  // Render doors
  doors.map(d => {
    nextGrid[d.row][d.col] = DOOR
  })

  return nextGrid
}

//function move(
//  svg, 
//  selection, 
//  path, 
//  destination, 
//  {
//    validateNextStep = () => Promise.resolve({ proceed: true }),
//    randomDelay = true,
//  } = {},
//) {
//  if (!path || path.length === 0) return Promise.resolve(selection);
//
//  const stepDuration = 300; // Duration for each step
//  let currentPathIndex = 0;
//
//  const lineGenerator = d3.line()
//    .x(d => d.col * cellSize + cellSize / 2)
//    .y(d => d.row * cellSize + cellSize / 2)
//    .curve(d3.curveBasis) // Add curve interpolation for smoother movement
//
//  let guidePath = svg.append("path")
//    .attr("d", lineGenerator(path))
//    .attr('fill', 'none')
//    .attr('stroke', DEBUG ? 'red' : null)
//    .attr('stroke-width', '1px')
//    .attr('stroke-radius', '6px');
//
//  function updateGuidePath(newPath) {
//    guidePath.remove();
//    guidePath = svg.append("path")
//      .attr("d", lineGenerator(newPath))
//      .attr('fill', 'none')
//      .attr('stroke', DEBUG ? 'red' : null)
//      .attr('stroke-width', '1px')
//      .attr('stroke-radius', '6px');
//  }
//
//  // Create a continuous interpolator for smooth movement
//  function createPathInterpolator(start, end) {
//    const dx = end.col - start.col;
//    const dy = end.row - start.row;
//    return t => ({
//      x: (start.col + dx * t) * cellSize + cellSize / 2,
//      y: (start.row + dy * t) * cellSize + cellSize / 2
//    });
//  }
//
//  // Function to animate a single step with improved smoothness
//  async function animateStep() {
//    const currentPos = path[currentPathIndex];
//    const nextPos = path[currentPathIndex + 1];
//
//    if (!nextPos) {
//      console.log('no pos')
//      guidePath.remove();
//      return selection;
//    }
//
//    const validationResult = await validateNextStep(currentPos, nextPos);
//    const { proceed, findNewPath = false } = validationResult
//
//    if (!proceed) {
//      if (findNewPath) {
//        const newPath = searchPath(
//          gridRef.current,
//          currentPos.row,
//          currentPos.col,
//          destination.row,
//          destination.col,
//        );
//
//        if (newPath) {
//          path = newPath;
//          currentPathIndex = 0;
//          updateGuidePath(newPath);
//          return animateStep();
//        }
//      }
//
//      guidePath.remove();
//      return selection;
//    }
//
//    // Create smooth interpolator for this step
//    const interpolator = createPathInterpolator(currentPos, nextPos);
//
//    selection.transition('grid-move')
//      .duration(stepDuration)
//      .ease(d3.easeLinear)
//      .attrTween("transform", () => t => {
//        const pos = interpolator(t);
//        return `translate(${pos.x}, ${pos.y})`;
//      })
//      .on('end', () => {
//        currentPathIndex++;
//        animateStep()
//      })
//  }
//
//  // Start the animation with initial delay, but only for the first movement
//  return new Promise((resolve) => {
//    const anim = () => {
//      animateStep()
//        .then(() => {
//          guidePath.remove()
//          resolve(selection)
//        })
//        .catch(e => {
//          guidePath.remove()
//          console.log('Error', e)
//        })
//    }
//    if (randomDelay) {
//      const initialDelay = currentPathIndex === 0 ? randomInt(1000, 3000) : 0
//      setTimeout(() => anim(), initialDelay)
//    } else {
//      anim()
//    }
//  })
//}

// Example usage with async validation:
// const validateNextStep = async (currentPos, nextPos) => {
//   const bearInNextPos = allBears.some(bear =>
//     bear.pos.row === nextPos.row && bear.pos.col === nextPos.col
//   );
//
//   if (bearInNextPos) {
//     // Do some async operation, like another animation
//     await someOtherAnimation();
//
//     return {
//       proceed: false,
//       findNewPath: true
//     };
//   }
//
//   return { proceed: true };
// };
// returns the room if found, else returns null

function roomByName(state, name) {
  for (let i=0; i < state.allRooms.length; i++) {
    if (state.allRooms[i].name === name) {
      return state.allRooms[i]
    }
  }
  return null
}

// expects each element of things to have a prop named pos that looks like: { pos: { row, col } }
// returns true if none of things is in pos { row, col }, else return false
function hasNoneInPos(things, pos) {
  for (let i=0; i < things.length; i++) {
    if (things[i].pos.row === pos.row && things[i].pos.col === pos.col) {
      return false
    }
  }
  return true
}


// returns the first empty cell in a room
// if no empty cells, returns null
// TODO need to consider other honeypots, bears, items, etc.
function findEmptyCellInRoom(state, room) {
  const { grid, allHoneypots } = state
  const { startRow, startCol, width, height, doors } = room

  for (let r = startRow; r < startRow + height; r++) {
    for (let c = startCol; c < startCol + width; c++) {
      if (grid[r][c] === EMPTY && hasNoneInPos(allHoneypots, { row: r, col: c })) {
        return [r, c]
      }
    }
  }

  return null
}

// return { rowMin, rowMax, colMin, colMax }
function getExtent(obj) {
  const { id } = obj
  if (!id) {
    throw new Error('Unknown obj:', obj)
  }
  if (idUtils.isHouseID(id)) {
    const { pos } = obj
    const rowMax = pos.row + RRH_MAX_HEIGHT - 1
    const colMax = pos.col + RRH_MAX_WIDTH - 1
    return { rowMin: pos.row, rowMax, colMin: pos.col, colMax }
  }
  if (idUtils.isBearID(id)) {
    const { pos } = obj
    return { rowMin: pos.row, rowMax: pos.row, colMin: pos.col, colMax: pos.col }
  }
  if (idUtils.isHoneypotID(id)) {
    const { pos } = obj
    return { rowMin: pos.row, rowMax: pos.row, colMin: pos.col, colMax: pos.col }
  }
  if (idUtils.isDBID(id)) {
    const { pos } = obj
    const rowMax = pos.row + DB_MAX_HEIGHT - 1
    const colMax = pos.col + DB_MAX_WIDTH - 1
    return { rowMin: pos.row, rowMax, colMin: pos.col, colMax }
  }

  throw new Error('Unknown obj:', obj)
}


// extent is { rowMin, rowMax, colMin, colMax }
// returns bottom left corner of extent as { row, col }
function getBottomLeft(extent) {
  return { row: extent.rowMax, col: extent.colMin }
}

// extent is { rowMin, rowMax, colMin, colMax }
// returns bottom left corner of extent as { row, col }
function getBottomRight(extent) {
  return { row: extent.rowMax, col: extent.colMax }
}

// returns true if extentA is fully left of extentB
// else returns false
// expects inputs to be: { rowMin, rowMax, colMin, colMax }
function isFullyLeft(extentA, extentB) {
  return extentA.colMax < extentB.colMin
}

function isInDatabase(database, { row, col }) {
  const rowExtent = database.pos.row + DB_MAX_HEIGHT
  const colExtent = database.pos.col + DB_MAX_WIDTH
  return (row >= database.pos.row && row <= rowExtent) &&
    (col >= database.pos.col && col <= colExtent)
}

// returns true if row/col is inside any house, else returns false
function isInAnyDatabase(allDatabases, { row, col }) {
  if (!Array.isArray(allDatabases) || allDatabases.length === 0) {
    return false
  }

  for (let i = 0; i < allDatabases.length; i++) {
    if (isInHouse(allDatabases[i], { row, col })) {
      return true
    }
  }
  return false
}

function isInHouse(house, { row, col }) {
  const rowExtent = house.pos.row + RRH_MAX_HEIGHT
  const colExtent = house.pos.col + RRH_MAX_WIDTH
  return (row >= house.pos.row && row <= rowExtent) &&
    (col >= house.pos.col && col <= colExtent)
}

// returns true if row/col is inside any house, else returns false
function isInAnyHouse(allHouses, { row, col }) {
  if (!Array.isArray(allHouses) || allHouses.length === 0) {
    return false
  }

  for (let i = 0; i < allHouses.length; i++) {
    if (isInHouse(allHouses[i], { row, col })) {
      return true
    }
  }
  return false
}

function isInRoom(selection, room) {
  // Check if selection is in the bounds of a room
}

// returns true if row/col is inside any existing rooms, else returns false
// a position in a doorway is considered inside a room
function isPositionInAnyRoom(row, col) {
}

function moveToRoom(selection, room) {
  if (isInRoom(selection, room)) {
    // TODO maybe move to a random new square if in same room?
    return
  }
}

function getRandomGridPosition(grid) {
  const row = Math.floor(Math.random() * grid.length)
  const col = Math.floor(Math.random() * grid[0].length)
  return [row, col]
}

// returns a position where a bear can stand (i.e. a position without a wall)
export function getRandomStandingPosition(grid) {
  let row, col
  do {
    [row, col] = getRandomGridPosition(grid)
  } while (grid[row][col] === WALL)
  return [row, col]
}

// returns a position that will only occur on the first, last row, first column, or last column
// avoids walls
export function getRandomPerimeterPosition(grid) {
  let row, col;
  do {
    row = Math.floor(Math.random() * grid.length)
    if (row === 0 || row === grid.length-1)  {
      col = Math.floor(Math.random() * grid[0].length)
    } else {
      col = Math.random() < 0.5 ? 0 : grid[0].length-1
    }
  } while (grid[row][col] === WALL)
  return [row, col]
}

function findPath(grid, startRow, startCol, targetRow, targetCol) {
  const queue = [[startRow, startCol]]
  const visited = new Set()
  const parent = new Map()

  while (queue.length > 0) {
    const [row, col] = queue.shift()
    const key = `${row},${col}`

    if (row === targetRow && col === targetCol) {
      // Reconstruct path
      const path = []
      let current = key
      while (current) {
        const [r, c] = current.split(',').map(Number)
        path.unshift({row: r, col: c})
        current = parent.get(current)
      }
      return path
    }

    if (visited.has(key)) continue;
    visited.add(key)

    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const [dr, dc] of directions) {
      const newRow = row + dr
      const newCol = col + dc
      const newKey = `${newRow},${newCol}`

      if (newRow >= 0 && newRow < grid.length &&
        newCol >= 0 && newCol < grid[0].length &&
        grid[newRow][newCol] !== 1 && !visited.has(newKey)) {
        queue.push([newRow, newCol])
        parent.set(newKey, key)
      }
    }
  }

  return null; // No path found
}

function printGrid(grid) {
  for (let i = 0; i < grid.length; i++) {
    console.log(JSON.stringify(grid[i]))
  }
}


function searchPath(grid, startRow, startCol, targetRow, targetCol, maxTries=MAX_PATH_TRIES) {
  let tries = 0
  let path
  while (true) { // search for a valid path to target
    if (tries >= maxTries) {
      console.log('Exhausted max tries for finding a path. Giving up...')
      break
    }
    path = findPath(grid, startRow, startCol, targetRow, targetCol)
    if (!path) {
      console.log("No valid path found. Trying again.");
      tries++
      continue
    }
    return path
  }
  return path
}

// given x,y coordinates, returns the nearest row/col
const nearestCell = ({ x, y }, { gridSizeX, gridSizeY }) => {
  return {
    row: Math.floor((y / cellSize) % gridSizeY),
    col: Math.floor((x / cellSize) % gridSizeX),
  }
}

function parseTransform(a) {
  let b = {}
  for (let i in a = a.match(/(\w+)\(([^,)]+),?([^)]+)?\)/gi)) {
    let c = a[i].match(/[\w\.\-]+/g)
    b[c.shift()] = c
  }
  return b
}

const drawSingleDB = ({ width=50, height=15 }={}) => selection => {
  const rectWidth = width
  const rectHeight = height

  selection.append('rect')
    .attr('width', rectWidth)
    .attr('height', rectHeight)
    .attr('fill', 'silver')
    .attr('stroke', 'black')
    .attr('stroke-width', '1.5px')
    .attr('rx', 2)
    .attr('ry', 2)
  selection.append('circle')
    .attr('r', 2.5)
    .attr('fill', 'gold')
    .style('stroke-width', '1.5px')
    .style('stroke', 'black')
    .attr('transform', `translate(${rectWidth - 10}, ${rectHeight/2})`)
}

function drawDatabase(selection, { houses } = {} ) {
  const layerHeight = 12
  const layerWidth = 40
  const db = selection.append('g')
  const single = drawSingleDB({ width: layerWidth, height: layerHeight})
  const first = db.append('g').call(single)
  const second = db.append('g').attr('transform', `translate(0, ${layerHeight * 1})`).call(single)
  const third = db.append('g').attr('transform', `translate(0, ${layerHeight * 2})`).call(single)
}

const gridPathGenerator = d3.line()
  .x(d => d.col * cellSize + cellSize / 2)
  .y(d => d.row * cellSize + cellSize / 2)
  .curve(d3.curveBasis) // Add curve interpolation for smoother movement
  
// newPath is usually the output of searchPath
function renderPath(selection, newPath) {
  return selection.append('path')
    .attr('d', gridPathGenerator(newPath))
    .attr('fill', 'none')
    .attr('stroke', 'black')
    .attr('stroke-width', '1.5px')
    .attr('stroke-radius', '6px')
}

// given an object (e.g. bear, house) that contains positional data, returns a row/col for connection
// throws error if connection cannot be found
// return { srcPos: { row, col }, dstPos: { row, col } }
function connectionRowCols(src, dst) {
  const { id: srcId } = src
  if (!srcId) {
    throw new Error('Cannot find connection to src:', src)
  }
  const { id: dstId } = dst
  if (!dstId) {
    throw new Error('Cannot find connection to dst:', dst)
  }

  const srcExtent = getExtent(src)
  const dstExtent = getExtent(dst)

  let srcPos, dstPos
  if (isFullyLeft(srcExtent, dstExtent)) {
    srcPos = getBottomRight(srcExtent)
    dstPos = getBottomLeft(dstExtent)
  } else {
    srcPos = getBottomLeft(srcExtent)
    dstPos = getBottomLeft(dstExtent)
  }
  return { srcPos, dstPos }
}

function animAlongPath(selection, path, { gridSizeX, gridSizeY, dir='forward' }={}) {
  const pathNode = path.node()
  const pathLength = pathNode.getTotalLength()

  return selection
    .transition('path-follow')
    .duration(pathLength / cellSize * ANIM_PATH_STEP_DUR) // Scale duration by path length
    .ease(d3.easeLinear)
    .attrTween('transform', () => {
      return t => {
        let len;
        if (dir === 'backward') {
          len = (1 - t) * pathLength
        } else { // forward, default
          len = t * pathLength
        }
        const point = pathNode.getPointAtLength(len)
        const row = Math.floor((point.y / cellSize) % gridSizeY)
        const col = Math.floor((point.x / cellSize) % gridSizeX)
        return `translate(${point.x}, ${point.y})`
      }
    })
    .end()
}

// returns the next row/col for a single step from currentPos to destPos
function getNextStep(currentPos, destPos) {
  const rowDiff = destPos.row - currentPos.row;
  const colDiff = destPos.col - currentPos.col;

  let newRow = currentPos.row;
  let newCol = currentPos.col;

  if (rowDiff !== 0) {
    newRow += Math.sign(rowDiff);
  } else if (colDiff !== 0) {
    newCol += Math.sign(colDiff);
  }

  return { row: newRow, col: newCol };
}

const Viz = forwardRef(({
  state={},
  vizWidth=900,
  vizHeight=600,
  onChangeGrid,
  onChangeRooms,
  onChangeBears,
  onDoorClearanceNeeded,
  shouldVerifyDoorClearance,
  isClearedForDoor=() => { return true },
  onInitialized=() => {},
  onClickCell=() => {},
  options={
    showPolicyHighlights: false,
    showBearNames: true,
    showBearLabels: false, // can be a function or boolean
    showHouseLabels: false,
  },
}, ref) => {
  const svgRef = useRef()
  const gridContainerRef = useRef()
  const bearsContainerRef = useRef()
  const housesContainerRef = useRef()
  const databasesContainerRef = useRef()
  const connectionsContainerRef = useRef()
  const requestsContainerRef = useRef()

  const { rooms, bears, honeypots, houses, databases, connections } = state

  const changeGrid = typeof onChangeGrid === 'function' ? onChangeGrid : () => {}
  const changeRooms = typeof onChangeRooms === 'function' ? onChangeRooms : () => {}
  const changeBears = typeof onChangeBears === 'function' ? onChangeBears : () => {}
  const doorClearance = typeof onDoorClearanceNeeded === 'function' ? onDoorClearanceNeeded : () => {}

  const allRooms = rooms
  const allBears = bears
  const allHoneypots = honeypots

  // expects each to be { id: '', pos: { row, col } } as a static position of the house
  const allHouses = houses

  // expects each to be { id: '', pos: { row, col } }
  const allDatabases = databases

  // expects each to be { id: '', src: '', dst: '', } }
  const allConnections = connections

  // use ceil here because we want the grid to cover the entire viz
  const gridSizeX = Math.ceil(vizWidth / cellSize)
  const gridSizeY = Math.ceil(vizHeight / cellSize)

  const [grid, setGrid] = useState(d3.range(gridSizeY).map(() => Array(gridSizeX).fill(0)))
  const gridRef = useRef(grid) // use a ref so that the bear animate functions always have the current value
  const honeypotsRef = useRef(allHoneypots) // use a ref so that the bear animate functions always have the current value

  const width = vizWidth
  const height = vizHeight

  useEffect(() => {
    setGrid(state.grid)
  }, [state.grid])

  function move(
    svg,
    selection,
    path,
    destination,
    { // options
      validateNextStep = () => Promise.resolve({ proceed: true }),
      randomDelay = false,
    } = {},
  ) {
    if (!path || path.length === 0) return Promise.resolve(selection);
  
    const stepDuration = 300
    let currentPath = path
  
    let guidePath = svg.append('path')
      .attr('d', gridPathGenerator(path))
      .attr('fill', 'none')
      .attr('stroke', DEBUG ? 'red' : null)
      .attr('stroke-width', '1px')
      .attr('stroke-radius', '6px')
  
    function updateGuidePath(newPath) {
      guidePath.remove()
      guidePath = svg.append('path')
        .attr('d', gridPathGenerator(newPath))
        .attr('fill', 'none')
        .attr('stroke', DEBUG ? 'red' : null)
        .attr('stroke-width', '1px')
        .attr('stroke-radius', '6px')
    }
  
    async function animateAlongPath() {
      try {
        // First validate the entire path
        for (let i = 0; i < currentPath.length - 1; i++) {
          const validationResult = await validateNextStep(currentPath[i], currentPath[i + 1])
          if (!validationResult.proceed) {
            if (validationResult.findNewPath) {
              const newPath = searchPath(
                gridRef.current,
                currentPath[i].row,
                currentPath[i].col,
                destination.row,
                destination.col
              );
  
              if (newPath) {
                currentPath = newPath
                updateGuidePath(newPath)
                return animateAlongPath() // Restart with new path
              }
            }
            guidePath.remove()
            return selection
          }
        }
  
        // Now animate along the entire validated path
        const pathNode = guidePath.node()
        const pathLength = pathNode.getTotalLength()
  
        return selection
          .transition('grid-move')
          .duration(pathLength / cellSize * stepDuration) // Scale duration by path length
          .ease(d3.easeLinear)
          .attrTween('transform', () => {
            return t => {
              const point = pathNode.getPointAtLength(t * pathLength)
              const row = Math.floor((point.y / cellSize) % gridSizeY)
              const col = Math.floor((point.x / cellSize) % gridSizeX)
              if (grid[row][col] === DOOR) {
                // TODO save this outside, then check if any of the corners in the direction the selection is moving
                // is about to hit a door (maybe on next step?)
                // console.log(selection.node().getBBox())
                if (shouldVerifyDoorClearance) {
                  doorClearance(selection, { row, col }) // re-routing will occur through the caller if needed
                } else {
                  if (!isClearedForDoor(selection.datum(), { row, col })) {
                    // TODO rejection route
                  }
                }
                if (!isClearedForDoor(selection.datum(), { row, col })) {
                  doorClearance(selection, { row, col })
                }
              }
              return `translate(${point.x}, ${point.y})`
            }
          })
          .end()
  
      } catch (error) {
        console.log('error animating:', error)
        guidePath.remove()
        return selection
      }
    }
  
    // Start the animation with initial delay
    return new Promise((resolve) => {
      const anim = () => {
        animateAlongPath()
          .then(() => {
            guidePath.remove()
            resolve(selection)
          })
          .catch(e => {
            guidePath.remove()
            console.log('Error', e)
          })
      }
  
      if (randomDelay) {
        setTimeout(() => anim(), randomInt(1000, 3000))
      } else {
        anim()
      }
  
    })
  }

  useEffect(() => {
    // re-render all rooms
    // (since we're just setting values on the grid, this should not affect rooms already rendered)
    let nextGrid = grid
    for (let i=0; i < rooms.length; i++) {
      nextGrid = renderRoom(nextGrid, rooms[i])
    }

    // render all houses
    if (Array.isArray(houses) && houses.length > 0) {
      for (let i=0; i < houses.length; i++) {
        nextGrid = renderHouse(nextGrid, houses[i])
      }
    }

    // render all databases
    if (Array.isArray(databases) && databases.length > 0) {
      for (let i=0; i < databases.length; i++) {
        nextGrid = renderDatabase(nextGrid, databases[i])
      }
    }

    setGrid(nextGrid)
    onInitialized()
  }, [JSON.stringify(rooms), JSON.stringify(bears), JSON.stringify(grid), JSON.stringify(houses), JSON.stringify(databases)])

  useEffect(() => {
    changeGrid(grid)
    gridRef.current = grid
  }, [grid])

  useEffect(() => {
    updateViz()
    honeypotsRef.current = allHoneypots
  }, [allRooms, allBears, allHoneypots, allHouses, allDatabases, allConnections, options, grid])

  const moveBearToTarget = (bearId, target, onEnterTarget = () => {}) => {
    const bear = allBears.find(b => b.id === bearId)
    if (!bear) {
      console.log('no bear', bearId)
      return
    }

    let targetRow, targetCol;
    if (idUtils.isHouseID(target) || idUtils.isHouseID(target?.id)) {
      const house = allHouses.find(h => h.id === target || h.id === target?.id)
      if (!house) {
        return
      }
      const { row, col } = houseDoorCoords(house)
      targetRow = row
      targetCol = col
    } else {
      targetRow = target.row
      targetCol = target.col
    }
    const bearEl = d3.select(`#${bearId}`)

    console.log('searching', bear.pos, { targetRow, targetCol })

    // TODO get closest row/col to bear current transform, and pass that to searchPath
    // TODO (extend/draw path from current position instead of row/col if curr position is not row/col)
    const path = searchPath(grid, bear.pos.row, bear.pos.col, targetRow, targetCol)
    if (!path) {
      console.log('No path found for bear to target')
      return // no path found
    }

    move(
      d3.select(svgRef.current),
      bearEl,
      path,
      { row: targetRow, col: targetCol },
      { randomDelay: false },
    ).then(bear => {
      if (typeof onEnterTarget === 'function') {
        onEnterTarget(bear)
      }
    })
    .catch(e => console.log(e))
  }

  // can only make a request to db if has connection to db
  // makes a request and response animation starting from an obj to a db
  // onReq must be resolved for the animation to continue
  const dbReqRes = async (objId, dbId, { onReq=()=>Promise.resolve(), onRes }={}) => {
    const reqqer = typeof onReq === 'function' ? onReq : () => Promise.resolve()
    const resser = typeof onRes === 'function' ? onRes : () => {}
    const obj = searchByID(objId, state)
    if (!obj) {
      console.log('Not found:', objId)
      return
    }
    const db = searchByID(dbId, state)
    if (!db) {
      console.log('Not found:', dbId)
      return
    }
    const conn = findConnection(state, obj.id, db.id)
    if (!conn) {
      throw new Error('Not connected:', objId, dbId)
    }
    // add ball
    const req = d3.select(requestsContainerRef.current).append('g')
      .attr('class', 'request')
    req.append('circle')
      .attr('r', 2)
      .attr('fill', 'gold')
      .attr('stroke', 'black')
      .attr('stroke-width', '1.5px')
    return animAlongPath(req, d3.select(`#${conn.id} path`), { gridSizeX, gridSizeY })
      .then(() => {
        reqqer().then(() => {
          animAlongPath(req, d3.select(`#${conn.id} path`), { gridSizeX, gridSizeY, dir: 'backward' })
            .then(() => {
              req.remove()
              resser()
            })
        })
      })
  }

  useImperativeHandle(ref, () => {
    return {
      moveBearToTarget,
      dbReqRes,
      pause: () => {
        d3.select(bearsContainerRef.current)
          .selectAll('g.bear')
          .interrupt('grid-move')

        // now get current position of bears and update
        changeBears(structuredClone(allBears).map(b => {
          const bear = d3.select(`#${b.id}`)
          const { translate } = parseTransform(bear.attr('transform'))
          const nextPos = nearestCell({ x: +translate[0], y: +translate[1] }, { gridSizeX, gridSizeY })
          return {
            ...b,
            pos: nextPos,
          }
        }))
      },
      stepBear: () => {
        // TODO move one step, update data
      },
      moveBear: (id, { row, col }) => { // moves with a transition
        const bear = allBears.find(b => b.id === id)
        if (!bear) {
          return Promise.resolve()
        }
        const path = searchPath(grid, bear.pos.row, bear.pos.col, row, col)
        if (!path) {
          console.log('No path found for bear to row/col')
          // animate direction of movement and bounce back
          const bouncePos = getNextStep(bear.pos, { row, col })
          console.log(bear.pos, bouncePos)
          const thing = d3.select(`#${id}`)
          const currentTransform = thing.attr("transform") || ""
          // bounce animation when no path found
          const bounceTransform = `translate(${(bouncePos.col - bear.pos.col) * 10}, ${(bouncePos.row - bear.pos.row) * 10})`
          return new Promise((resolve, reject) => {
            thing
              .transition()
              .duration(150)
              .attr("transform", `${currentTransform} ${bounceTransform}`)
              .transition()
              .duration(300)
              .ease(d3.easeBounce)
              .attr("transform", currentTransform)
              .on('end', function() {
                //resolve() // TODO probably should reject here so that bear pos is not updated in the caller
                reject() // TODO probably should reject here so that bear pos is not updated in the caller
              });
          });
        }

        return move(d3.select(svgRef.current), d3.select(`#${id}`), path, { row, col })
      },
      getHouseBounds: houseId => {
        const house = allHouses.find(h => h.id === houseId)
        if (!house) {
          return
        }
        return d3.select(`#${house.id}`).node().getBoundingClientRect()
      },
    }
  }, [allBears])

  const addRoom = newRoom => {
    setAllRooms(prev => ([...prev, newRoom]))
  }

  const updateViz = () => {
    const svg = d3.select(svgRef.current)
    const bearsContainer = d3.select(bearsContainerRef.current)
    const housesContainer = d3.select(housesContainerRef.current)
    const databasesContainer = d3.select(databasesContainerRef.current)
    const connectionsContainer = d3.select(connectionsContainerRef.current)
    const gridContainer = d3.select(gridContainerRef.current)

    function updateGrid() {
      const cells = gridContainer.selectAll('rect')
        .data(grid.flat())
        .join('rect')
        .attr('x', (d, i) => (i % grid[0].length) * cellSize)
        .attr('y', (d, i) => Math.floor(i / grid[0].length) * cellSize)
        .attr('width', cellSize - 1)
        .attr('height', cellSize - 1)
        .attr('data-index', (d, i) => i)
        .on('click', function (e, d) {
          const i = +d3.select(this).attr('data-index')
          onClickCell({ row: Math.floor(i / grid[0].length), col: i % grid[0].length })
        })
        .attr('fill', (d, i) => {
          const col = i % grid[0].length
          const row = Math.floor(i / grid[0].length)

          // hide the footprint of a house (since it looks like a room)
          if (isInAnyHouse(allHouses, { row, col })) {
            return 'white'
          }

          // hide the footprint of a database (since it looks like a room)
          if (isInAnyDatabase(allDatabases, { row, col })) {
            return 'white'
          }

          if (d === EMPTY) {
            return 'white'
          } else if (d === WALL) {
            return 'gray'
          } else {
            return 'brown' // doors
          }
        })
        .attr('stroke', DEBUG ? 'black' : null)
        .attr('stroke-width', DEBUG ? '1px' : null)

      const bears = bearsContainer.selectAll('g.bear').data(allBears, d => d.id)
      const honeypots = svg.selectAll('text.honeypot').data(allHoneypots, d => d.id)
      const houses = housesContainer.selectAll('g.house').data(allHouses, d => d.id)
      const databases = databasesContainer.selectAll('g.database').data(allDatabases, d => d.id)
      const connections = connectionsContainer.selectAll('g.connection').data(allConnections, d => d.id)

      // take care of labels
      if (options.hasOwnProperty('showBearLabels')) {
        svg.selectAll('.bear-label').filter((d, i) =>
          shouldShowBearLabels(options.showBearLabels, d, i) ? true : false
        ).attr('visibility', 'visible').transition().duration(300).attr('opacity', 1)
        svg.selectAll('.bear-label').filter((d, i) =>
          shouldShowBearLabels(options.showBearLabels, d, i) ? false : true
        ).transition().duration(300).attr('opacity', 0).transition().attr('visibility', 'hidden')
      }
      if (options.showHouseLabels) {
        svg.selectAll('.house-label')
          .attr('visibility', 'visible')
        .transition()
          .duration(300)
          .attr('opacity', 1)
      } else {
        svg.selectAll('.house-label').transition().duration(300).attr('opacity', 0)
      }

      if (options.showPolicyHighlights) {
        svg.selectAll('.policy-highlight')
        .transition()
          .duration(300)
          .attr('opacity', 1)
      } else {
        svg.selectAll('.policy-highlight').transition().duration(300).attr('opacity', 0)
      }

      function animate(bear) {
        const grid = gridRef.current
        const allHoneypots = honeypotsRef.current
        let tries = 0
        while (true) { // search for a valid path to target
          if (tries >= MAX_PATH_TRIES) {
            console.log('Exhausted max tries for finding a path. Giving up...')
            break
          }
          const bearData = bear.datum()

          const { row, col } = bearData.pos
          let targetRow, targetCol;
          if (allHoneypots.length > 0 && bearData.hunger > 0) {
            const hr = allHoneypots[0].pos.row
            const hc = allHoneypots[0].pos.col
            if (row === hr && col === hc) { // TODO already on honeypot, move one away
              // TODO this shold be called with all of the state, not just some of it
              //findEmptyCellInRoom({ grid, allHoneypots }, roomByName)
            }
            targetRow = hr
            targetCol = hc
          } else {
            [targetRow, targetCol] = getRandomStandingPosition(grid)
          }

          const path = findPath(grid, row, col, targetRow, targetCol)

          if (!path) {
            console.log("No valid path found. Trying again.");
            tries++
            continue
          }

          move(svg, bear, path, { row: targetRow, col: targetCol })
            .then(selection => animate(selection))
            .catch(e => console.log(e))

          // Update current position after movement
          bearData.pos.row = targetRow
          bearData.pos.col = targetCol
          bearData.hunger = Math.random() < 0.75 ? randomInt(1, 5) : 0
          break
        }
      }

      bears.join(
        enter => {
          const bEnter = enter.append('g')
            .attr('class', 'bear')
            .attr('opacity', 0)
            .attr('id', d => d.id)
            .attr('transform', d =>
              `translate(${d.pos.col * cellSize + cellSize / 2}, ${d.pos.row * cellSize + cellSize / 2})`
            )

          bEnter.append('text')
            .attr('font-size', cellSize)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            // set at current position
            .text(d => {
              if (d.type === 'user') {
                return '🐻'
              }
              if (d.type === 'imposter') {
                return '🐼'
              }
              return '🧸'
            })

          if (options.showBearNames) {
            bEnter.append('text')
              .attr('font-size', BEAR_NAME_FONT_SIZE)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'central')
              .attr('dy', BEAR_NAME_FONT_SIZE + 2)
              .text(d => d.name)
          }

          const bLabel = bEnter.append('g')
              .attr('class', 'bear-label')
              .attr('opacity', (d, i) => shouldShowBearLabels(options.showBearLabels, d, i) ? 1 : 0)
              .attr('transform', `translate(${cellSize*3}, 0)`)

          // bear policy highlight
          const policyHighlight = bEnter.append('g')
            .attr('class', 'policy-highlight')
            .style('pointer-events', 'none')
            .attr('opacity', options.showPolicyHighlights ? 1 : 0)

          policyHighlight.append('rect')
            .attr('transform', d => `translate(-27, -30)`) // compensate for bear text
            .style('pointer-events', 'none')
            .attr('width', 55)
            .attr('height', 55)
            .attr('fill', 'transparent')
            .attr('stroke', 'rgb(53,41,144)')
            .attr('stroke-width', '2')

          // background for text
          policyHighlight.append('rect')
            .attr('transform', d => `translate(-27, -30)`) // compensate for bear text
            .style('pointer-events', 'none')
            .attr('width', 55)
            .attr('height', 17)
            .attr('fill', 'rgb(53,41,144)')
            .attr('stroke-width', '2')

          // policy label
          policyHighlight.append('text')
            .attr('transform', d => `translate(-25, -18)`) // compensate for bear text
            .style('pointer-events', 'none')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .attr('fill', 'white')
            .text('Bear')

          bLabel
            .filter((d, i) =>
              isImposter(d, i) && shouldShowBearLabels(options.showBearLabels, d, i)
            )
            .append('animate')
            .attr('attributeName', 'opacity')
            .attr('values', '1;0')
            .attr('dur', '1s')
            .attr('calcMode', 'linear')
            .attr('repeatCount', 'indefinite')

          bLabel.append('polyline')
            .attr('fill', 'none')
            .attr('stroke', d => isImposter(d) ? MARKER_COLOR : 'black')
            .attr('points', `-${cellSize},0 -${cellSize*2},0`)
            .attr('marker-end', d => isImposter(d) ? 'url(#imposter-marker)' : 'url(#regular-marker)')

          bLabel.append('text')
            .attr('font-size', 14)
            .attr('fill', d => isImposter(d) ? MARKER_COLOR : 'black')
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'central')
            .attr('dx', -cellSize+3) // space out from the marker line
            .text(d => `${titleCase(indefiniteArticle(d.type))} ${d.type}`)


          bEnter.transition('bear-enter') // entrance transition
            .attr('opacity', 1)
            .each(function(d) {
              if (d.movement === 'controlled') {
                return
              }
              animate(d3.select(this))
            })
        },
        // updates are not needed because the enter selection starts off a sequence of transitions
        update => { },
        exit => {
          exit
            .transition('bear-exit')
            .attr('opacity', 0)
            .remove()
        },
      )

      honeypots.join(
        enter => {
          enter.append('text')
            .attr('class', 'honeypot')
            .attr('id', d => d.id)
            .attr('font-size', cellSize)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            // set at current position
            .attr('transform', d =>
              `translate(${d.pos.col * cellSize + cellSize / 2}, ${d.pos.row * cellSize + cellSize / 2})`
            )
            .text('🍯')
        },
      )

      databases.join(
        enter => {
          const dEnter = enter.append('g')
            .attr('class', 'database')
            .attr('id', d => d.id)
            .attr('transform', d =>
              `translate(${d.pos.col * cellSize}, ${d.pos.row * cellSize})`
            )

          dEnter.call(drawDatabase, { houses: allHouses })

          // database label
          const dLabel = dEnter.append('g')
            .attr('class', 'database-label')
            .attr('transform', `translate(22,-10)`)
          //.attr('opacity', options.showDatabaseLabel ? 1 : 0)

          dLabel.append('text')
              .attr('font-size', 14)
              .style('color', MARKER_COLOR)
              .attr('text-anchor', 'middle')
              .text('Your database')

        },
      )

      houses.join(
        enter => {
          const hEnter = enter.append('g')
            .attr('class', 'house')
            .attr('id', d => d.id)
            .attr('transform', d =>
              `translate(${d.pos.col * cellSize}, ${d.pos.row * cellSize})`
            )

          hEnter.append('use')
            .attr('href', '#red-roof-house')

          // house policy highlight
          const policyHighlight = hEnter.append('g')
            .attr('class', 'policy-highlight')
            .attr('opacity', options.showPolicyHighlights ? 1 : 0)

          policyHighlight.append('rect')
            .attr('transform', d => `translate(-30, -35)`) // compensate for svg drawing of house
            .attr('width', 125)
            .attr('height', 130)
            .attr('fill', 'transparent')
            .attr('stroke', 'rgb(53,41,144)')
            .attr('stroke-width', '2')

          // background for text
          policyHighlight.append('rect')
            .attr('transform', d => `translate(-30, -35)`) // compensate for svg drawing of house
            .attr('width', 125)
            .attr('height', 22)
            .attr('fill', 'rgb(53,41,144)')
            .attr('stroke-width', '2')

          // policy label
          policyHighlight.append('text')
            .attr('transform', d => `translate(-25, -20)`) // compensate for svg drawing of house
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .attr('fill', 'white')
            .text('House')

          // house label
          const hLabel = hEnter.append('g')
            .attr('class', 'house-label')
            .attr('opacity', options.showHouseLabels ? 1 : 0)
            .attr('transform',
              `translate(${RRH_MAX_WIDTH / 2 * cellSize}, -${RRH_MAX_HEIGHT / 2 * cellSize})`
            )
          hLabel.append('polyline')
            .attr('fill', 'none')
            .attr('stroke', 'black')
            .attr('points', `-4,10 -4,${RRH_MAX_HEIGHT*cellSize/2 - 10}`)
            .attr('marker-end', `url(#regular-marker)`)

          hLabel.append('text')
              .attr('font-size', 14)
              .style('color', MARKER_COLOR)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'central')
              .attr('dx', 5) // space out from the marker line
              .text('Your app')
        },
        update => {
        },
      )

      connections.join(
        enter => {
          const cEnter = enter.append('g')
            .attr('id', d => d.id)
            .attr('class', 'connection')
          cEnter.append('path')
            .attr('d', d => {
              console.log(d)
              const src = searchByID(d.src, state)
              const dst = searchByID(d.dst, state)
              if (!src || !dst) {
                throw new Error('Could not find things for connections:', src, dst)
              }

              console.log(src, dst)
              const { srcPos, dstPos } = connectionRowCols(src, dst)
              console.log(srcPos, dstPos)
              console.log(grid)
              const path = searchPath(gridRef.current, srcPos.row, srcPos.col, dstPos.row, dstPos.col)
              if (!path) {
                throw new Error('Could not find path between:', src, dst)
              }
              return gridPathGenerator(path)
            })
            .attr('fill', 'none')
            .attr('stroke', 'black')
            .attr('stroke-width', '1.5px')
            .attr('stroke-radius', '6px')
        },
      )

    }

    updateGrid()

  }

  return (
    <div>
      <svg ref={svgRef} className="border rounded-xl border-black" width={width} height={height}>
        <defs>
          {/* at scale(0.17)translate(-44,0) the house has a footprint of 4x4 grid cells when cellSize=20 and entrance is on square (x: 3, y: 4) */}
          <g transform="scale(0.17)translate(-44,0)" id="red-roof-house">
            <path fillRule="nonzero" d="M9.005 183.371a12.09 12.09 0 012.537-2.598L248.016 2.406c4.177-3.127 10.077-3.288 14.458 0l115.875 87.017V70.365c-5.821-.01-10.537-4.731-10.537-10.552V34.589c0-5.827 4.725-10.551 10.552-10.551h83.575c5.827 0 10.552 4.724 10.552 10.551v25.224c0 5.824-4.719 10.545-10.54 10.552v81.843l36.413 27.344a12.04 12.04 0 012.185 1.85c30.558 32.907-5.7 80.853-42.52 71.541v207.555c0 7.325-5.94 13.265-13.265 13.265H64.878c-7.325 0-13.265-5.94-13.265-13.265V252.147c-36.464 7.471-67.578-36.805-42.608-68.776z"/>
            <path fill="#E2E9E3" d="M256.738 100.953l188.026 145.986v213.559h-53.971l.003-.158V314.242c0-5.554-4.368-10.057-9.755-10.057H280.904c-5.387 0-9.755 4.503-9.755 10.057V460.34l.003.158H64.878V247.094l191.86-146.141zM128.599 304.389H235.24c5.554 0 10.056 4.411 10.056 9.853v83.429c0 5.442-4.502 9.853-10.056 9.853H128.599c-5.554 0-10.057-4.411-10.057-9.853v-83.429c0-5.442 4.503-9.853 10.057-9.853z"/>
            <path fill="#CCD2CD" d="M256.738 100.953l14.222 11.056L90.132 255.99l-3.339 204.508H63.784l1.094-213.58z"/>
            <path fill="#E2534B" d="M451.399 70.365v73.919l-62.498-46.937V70.365z"/>
            <path fill="#E2E9E3" d="M378.364 34.589h83.575v25.225h-83.575z"/>
            <path fill="#E2534B" d="M18.794 190.38c-20.167 25.077 9.009 61.919 38.549 47.153l199.49-151.768 193.23 150.203c28.924 21.505 66.555-19.596 41.678-46.372L255.268 12.012 18.794 190.38z"/>

            <path fill="#CC4B44" d="M18.794 190.38c-15.914 23.528.939 31.801 30.48 17.035l206.711-155.24L278.79 29.68l-23.522-17.668L18.794 190.38z"/>

            <g className="door">
              <path fill="#E2534B" d="M280.904 314.242h100.137V460.34H280.904V314.242zm84.174 62.882l4.357 2.208a2.33 2.33 0 011.276 2.073l.006 16.078a2.333 2.333 0 01-1.899 2.29l-4.314 1.249a2.316 2.316 0 01-2.868-1.583l-.095-.644-.009-19.687a2.331 2.331 0 013.546-1.984z"/>
              <path fill="#CC4B44" d="M280.904 314.242h100.137v2.755c-118.269-.246-91.937 43.89-91.937 143.343h-8.2V314.242z"/>
            </g>

            <path fill="#fff" d="M128.599 314.242H176.7v37.695h-47.861l-.24.009v-37.704zm56.14 0h50.501v37.853a4.022 4.022 0 00-1.121-.158h-49.38v-37.695zm50.501 45.576v37.853h-50.501v-37.695h49.38c.389 0 .766-.055 1.121-.158zm-58.54 37.853h-48.101v-37.704l.24.009H176.7v37.695z"/>
            <path d="M253.533 182.475c14.176 0 25.67 11.49 25.67 25.669 0 14.177-11.494 25.67-25.67 25.67-14.18 0-25.67-11.493-25.67-25.67 0-14.179 11.49-25.669 25.67-25.669z"/>
          </g>
          <marker
            id="imposter-marker"
            viewBox="0 0 10 10"
            refX="1"
            refY="5"
            markerUnits="strokeWidth"
            markerWidth="10"
            markerHeight="10"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_COLOR} />
          </marker>
          <marker
            id="regular-marker"
            viewBox="0 0 10 10"
            refX="1"
            refY="5"
            markerUnits="strokeWidth"
            markerWidth="10"
            markerHeight="10"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
          </marker>
        </defs>
        <g ref={gridContainerRef} className="grid-container"></g>
        <g ref={connectionsContainerRef} className="connections-container"></g>
        <g ref={requestsContainerRef} className="requests-container"></g>
        <g ref={housesContainerRef} className="houses-container"></g>
        <g ref={databasesContainerRef} className="databases-container"></g>
        <g ref={bearsContainerRef} className="bears-container"></g>
      </svg>
    </div>
  )
})

export default Viz
