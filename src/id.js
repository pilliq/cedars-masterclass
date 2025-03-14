export function isHouseID(input) {
  return typeof input === 'string' && input.startsWith('house-')
}

export function isBearID(input) {
  return typeof input === 'string' && input.startsWith('bear-')
}

export function isHoneypotID(input) {
  return typeof input === 'string' && input.startsWith('honeypot-')
}

export function isDBID(input) {
  return typeof input === 'string' && input.startsWith('db-')
}

export function isConnID(input) {
  return typeof input === 'string' && input.startsWith('conn-') && input.includes('-to-')
}

export function newConnID(srcStr, dstStr) {
  return `conn-${srcStr}-to-${dstStr}`
}

// returns { srcId, dstId }
export function parseConnID(input) {
  if (!isConnID(input)) {
    return null
  }
  const match = input.match(/conn-(.+)-to-(.+)/)
  if (match) {
    return {
      srcId: match[1],
      dstId: match[2],
    }
  }
  return null
}

