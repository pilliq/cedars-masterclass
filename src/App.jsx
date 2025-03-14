import { useCallback, forwardRef, useRef, useState, useEffect, useImperativeHandle } from 'react'
import { Link, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Viz, {
  generateRoom,
  generateBear,
  newBear,
  generateHoneypot,
  getRandomStandingPosition,
  getRandomPerimeterPosition,
  generateConnection,
  houseDoorCoords,
} from './viz'
import './App.css'
import CodeEditor from './code-editor'
import * as d3 from 'd3'

const LIME_500 = '#84cc16'
const RED_500 = '#ef4444'
const YELLOW = 'yellow'

// e.g. is_resident(Bear{"Smokey"}, House{"cottage"}) =>
// { fn: 'is_resident', args: [{ type: 'Bear', value: 'Smokey' }, { type: 'House', value: 'cottage' }] }
function parseFact(input) {
  // regex extracts fn name and all arguments
  const regex = /^(\w+)\((.*)\)$/
  const match = input.match(regex)

  if (!match) {
    return null
  }
  const functionName = match[1]
  const argsString = match[2]

  // regex extracts each argument's type and value
  const argsRegex = /(\w+)\{"(.*?)"\}/g
  const args = []
  let argMatch

  while ((argMatch = argsRegex.exec(argsString)) !== null) {
    args.push({ type: argMatch[1], value: argMatch[2] })
  }

  return { fn: functionName, args: args }
}

const parsedFactsEqual = (pf1, pf2) => {
  if (pf1.fn !== pf2.fn) {
    return false
  }
  if (pf1.args.length !== pf2.args.length) {
    return false
  }
  for (let i = 0; i < pf1.args.length; i++) {
    if (pf1.args[i].type !== pf2.args[i].type || pf1.args[i].value !== pf2.args[i].value) {
      return false
    }
  }
  return true
}

const makeFact = (fn, args) => {
  const serArgs = args.map(a => `${a.type}\{"${a.value}"\}`).join(', ')
  return `${fn}(${serArgs})`
}

// Bear:Pat enter House:cottage
const parseQuery = input => {
  const regex = /(\w+):(\w+)\s+(\w+)\s+(\w+):(\w+)/
  const match = input.match(regex)

  if (!match) {
    return null
  }
  const actorType = match[1]
  const actorValue = match[2]
  const permission = match[3]
  const resourceType = match[4]
  const resourceValue = match[5]

  return {
    actor: { type: actorType, value: actorValue },
    permission: permission,
    resource: { type: resourceType, value: resourceValue }
  }
}

// used to render policy and facts together
const OsoCloud = forwardRef((props, ref) => {
  const { policy, facts } = props
  const nodeRef = useRef(null)
  const policyRef = useRef(null)
  const factsRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      get node() {
        return nodeRef.current
      },
      execute: query => {
        return new Promise(resolve => {
          policyRef.current.execute(query, factsRef)
            .then(response => {
              resolve(response)
            })
          })
      },
      cancelExecution: () => {
        policyRef.current.cancelExecution()
        factsRef.current.cancelExecution()
      },
    }
  })

  return (
    <div
      style={{backgroundColor: 'rgb(53, 41, 144)', borderColor: 'rgb(53, 41, 144)'}}
      className="p-3 border rounded-xl flex flex-col gap-y-3"
      ref={nodeRef}
    >
      <span className="text-white font-sm font-bold">Oso Cloud</span>
      <Policy policyLines={policy} ref={policyRef} />
      <Facts facts={facts} ref={factsRef} />
    </div>
  )
})

const Pill = ({ children }) => {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-50 px-1 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset">{children}</span>
  )
}

const SingleFact = ({ style, text, actionText, onClickAction }) => {
  return (
    <pre style={style} className="flex mt-3">
      {text}
      {actionText &&
        <button onClick={onClickAction}>
          {actionText}
        </button>
      }
    </pre>
  )
}

const MultiFact = ({ facts, actionText, onClickAction }) => {
  const clickAction = typeof onClickAction === 'function' ? onClickAction : () => {}
  const elems = facts.map((f, i) => {
    const fact = typeof f === 'string' ? f : f.fact
    return (
      <SingleFact
        key={i}
        text={f}
        actionText={actionText}
        onClickAction={() => clickAction(f, i)}
      />
    )
  })
  return (
    <div>
      {elems}
    </div>
  )
}

const PolicyAction = ({ policy, actionText, onClickAction, style }) => {
  const clickAction = typeof onClickAction === 'function' ? onClickAction : () => {}
  const elems = policy.map((p, i) => {
    const line = typeof p === 'string' ? p : p.line
    return (
      <pre key={i}>
        {line}
      </pre>
    )
  })
  return (
    <div style={style} className="flex items-end">
      <div>
        {elems}
      </div>
      <button onClick={onClickAction}>
        {actionText}
      </button>
    </div>
  )
}


const Facts = forwardRef(({ facts }, ref) => {
  let elems = []
  const highlightRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      cancelExecution: () => {
        d3.select('.facts-border-container').interrupt('facts-border')
        d3.select(highlightRef.current).selectAll('.code-highlight')
          .interrupt('highlight-move')
      },
      // searches for fact which matches query
      searchForFact: searchFact => {
        return new Promise(resolve => {
          const lines = d3.selectAll('.fact-line')
          const highlightContainer = d3.select(highlightRef.current)

          const parsedFact = parseFact(searchFact)

          d3.select('.facts-border-container').transition('facts-border')
            .style('border-width', '5px')
            .style('border-color', '#ffd803')
            .on('end', () => {
              const highlight = highlightContainer.append('div').attr('class', 'code-highlight')
                .style('position', 'fixed')
                .style('background-color', 'rgba(255,255,0,0.5)')
                .style('border', '1px solid black')
                .style('border-radius', '4px')
                .style('left', `${0}px`)
                .style('top', `${0}px`)
                .style('width', '100px')
                .style('height', '1em')

              const teardown = () => {
                d3.select('.facts-border-container').transition().style('border-width', '0px')
                d3.selectAll('.fact-line .status-dot').transition()
                  .style('opacity', 0)
                  .style('background-color', 'white')
                highlight.transition().attr('opacity', 0).remove()
              }

              const highlightLine = idx => {
                const lineNodes = lines.nodes()

                // never had facts
                if (lineNodes.length === 0) {
                  setTimeout(() => {
                    teardown()
                    return resolve({ authorized: false })
                  }, 500)
                  return
                }

                // no fact found, not authorized
                if (idx >= lineNodes.length) {
                  setTimeout(() => {
                    teardown()
                    return resolve({ authorized: false })
                  }, 500)
                  return
                }

                const factLine = d3.select(lineNodes[idx])
                const text = factLine.select('.fact-code')
                const textBox = text.node().getBoundingClientRect()

                factLine.select('.status-dot').transition()
                  .duration(250)
                  .style('opacity', 1)
                highlight.transition('highlight-move')
                  .duration(250)
                  .style('top', `${textBox.top}px`)
                  .style('left', `${textBox.left}px`)
                  .style('width', `${textBox.width}px`)
                  .style('height', `${textBox.height}px`)
                  .on('end', () => {
                    const pf = parseFact(text.text())
                    if (parsedFactsEqual(pf, parsedFact)) {
                      factLine.select('.status-dot').transition()
                        .duration(250)
                        .style('background-color', LIME_500)
                      setTimeout(() => {
                        teardown()
                        return resolve({ authorized: true })
                      }, 500)
                      return
                    } else {
                      factLine.select('.status-dot').transition()
                        .duration(250)
                        .style('background-color', RED_500)
                    }
                    setTimeout(() => {
                      highlightLine(idx + 1)
                    }, 250)
                  })
              }

              highlightLine(0)
            })

        })
      },
    }
  })

  if (Array.isArray(facts) && facts.length > 0) {
    elems = facts.map((f, i) => {
      const line = typeof f === 'string' ? f : f.line
      const hasContent = line.trim().length > 0
      return (
        <div key={i} className={`${hasContent ? 'fact-line' : ''} flex items-center gap-x-1`}>
          <div
            style={{opacity: 0}}
            className={`status-dot rounded-full border border-black bg-white w-3 h-3`}
          >
          </div>
          <span className={`${hasContent && 'fact-code'} rounded px-2`}>{line}</span>
        </div>
      )
    })
  }

  return (
    <div className="facts-border-container pb-4 border max-w-150 rounded-xl bg-white">
      <div className="px-4 py-1.5 mb-3 border border-[#DBCBD8] bg-[#DBCBD8] rounded-t-xl flex items-center justify-between">
        <span className="text-black font-bold">Facts</span>
      </div>
      <div className="flex gap-3">
        <div ref={highlightRef}></div>
        <pre className="pr-4 overflow-x-scroll min-h-10" style={{zIndex: 1}}>
          {elems}
        </pre>
      </div>
    </div>
  )
})

const Policy = forwardRef(({ policyLines, explainable=false }, ref) => {
  const [showExplain, setShowExplain] = useState(false)
  const highlightRef = useRef(null)
  const policyTitleRef = useRef(null)

  useImperativeHandle(ref, () => {
    return {
      cancelExecution: () => {
        d3.select('.policy-border-container').interrupt('policy-border')
        d3.select(highlightRef.current).selectAll('.code-highlight')
          .interrupt('highlight-move')
      },
      execute: (query, factsRef) => {
        return new Promise(resolve => {
          const lines = d3.selectAll('.policy-line')
          const highlightContainer = d3.select(highlightRef.current)
          const titleBox = policyTitleRef.current.getBoundingClientRect()

          // TODO this is not generalized
          const parsedQuery = parseQuery(query)
          const searchFact = makeFact('is_resident', [parsedQuery.actor, parsedQuery.resource])

          d3.select('.policy-border-container').transition('policy-border')
            .style('border-width', '5px')
            .style('border-color', '#ffd803')
            .on('end', () => {
              const highlight = highlightContainer.append('div').attr('class', 'code-highlight')
                .style('position', 'fixed')
                .style('background-color', 'rgba(255,255,0,0.5)')
                .style('border', '1px solid black')
                .style('border-radius', '4px')
                .style('left', `${0}px`)
                .style('top', `${0}px`)
                .style('width', '100px')
                .style('height', '1em')

              const teardown = () => {
                d3.selectAll('.policy-line .status-dot').transition()
                  .style('opacity', 0)
                  .style('background-color', 'white')
                highlight.transition().attr('opacity', 0)
                  .on('end', function() {
                    d3.select(this).remove()
                    d3.select('.policy-border-container').transition().style('border-width', '0px')
                  })
              }

              const highlightLine = idx => {
                const lineNodes = lines.nodes()
                if (idx >= lineNodes.length) {
                  // check for a matching fact, then exit based on response.
                  // TODO generalize
                  return
                }

                const policyLine = d3.select(lineNodes[idx])
                const text = policyLine.select('.policy-code')
                const textBox = text.node().getBoundingClientRect()

                highlight.transition('highlight-move')
                  .duration(350)
                  .style('top', `${textBox.top}px`)
                  .style('left', `${textBox.left}px`)
                  .style('width', `${textBox.width}px`)
                  .style('height', `${textBox.height}px`)
                  .on('end', () => {
                    policyLine.select('.status-dot').transition()
                      .style('opacity', 1)
                      .on('end', () => {
                        if (idx === lineNodes.length - 1) { // last line, which queries facts
                          factsRef.current.searchForFact(searchFact)
                            .then(res => {
                              policyLine.select('.status-dot').transition()
                                .style('background-color', res.authorized ? LIME_500 : RED_500)
                                .on('end', () => {
                                  teardown()
                                  return resolve(res)
                                })
                            })
                        } else {
                          policyLine.select('.status-dot').transition()
                            .style('background-color', LIME_500)
                        }
                        setTimeout(() => {
                          highlightLine(idx + 1)
                        }, 350)
                      })

                  })
              }

              highlightLine(0)
            })

        })
      },
    }
  })
  
  // 🔴🟢🟡
  return (
    <div className="flex bg-white rounded-xl">
      <div className="policy-border-container pb-4 border min-w-150 rounded-xl">
        <div className="px-4 py-1.5 mb-3 border border-[#DBCBD8] bg-[#DBCBD8] rounded-t-xl flex items-center justify-between">
          <div ref={policyTitleRef} className="text-black font-bold">Policy</div>
          {explainable && <div><button onClick={() => setShowExplain(true)}>Explain</button></div>}
        </div>
        <div className="flex gap-3">
          <div ref={highlightRef}></div>
          <pre className="pr-4 overflow-x-scroll" style={{zIndex: 1}}>
            {policyLines.map((pl, i) => {
              const line = typeof pl === 'string' ? pl : pl.line
              const hasContent = line.trim().length > 0
              return (
                <div key={i} className={`${hasContent ? 'policy-line' : ''} flex items-center gap-x-1`}>
                  <div
                    style={{opacity: 0}}
                    className={`status-dot rounded-full border border-black bg-white w-3 h-3`}
                  >
                  </div>
                  <span className={`${hasContent && 'policy-code'} rounded px-2`}>{line}</span>
                </div>
              )
            })}
          </pre>
        </div>
      </div>
      {explainable &&
      <div>
        <div className="pb-13"></div>
        <pre>
            {policyLines.map((pl, i) => {
              return (
                <div key={i}>
                  <span> </span>
                  {(showExplain && pl.explanation) &&
                      <span className="font-sans relative">
                        {pl.explanation}
                      </span>
                  }
                </div>
              )
            })}
        </pre>
      </div>
      }
    </div>
  )
})

const policy = [
  { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
  ' ',
  { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
  'resource Room{}',
  ' ',
  { 
    line: 'has_permission(bear:Bear, "enter", room:Room) if',
    explanation: 'A rule stating that bears who are residents of the house can enter a room.'
  },
  '  is_resident(Bear, house:House) and is_in(room, house);',
]

// each element of allStates is the setState output of useState
function applyAllStates(fn, data, allSetStates) {
  for (let i=0; i < allSetStates.length; i++) {
    allSetStates[i](prev => fn(prev, data))
  }
}

const initState = (state) => ({
  rooms: [],
  bears: [],
  honeypots: [],
  houses: [],
  databases: [],
  connections: [],
  policy,
  facts: [],
  grid: [],
  ...state,
})


const setGrid = (state, grid) => {
  const next = structuredClone(state)
  next.grid = grid
  return next
}

const setBears = (state, bears) => {
  const next = structuredClone(state)
  next.bears = bears
  return next
}

const setRooms = (state, rooms) => {
  const next = structuredClone(state)
  next.rooms = rooms
  return next
}

// fact should look like is_in(Room{{"foyer"}, House{"cottage"})
// returns "foyer" (without quotes"
// if no room name, returns null
const roomNameFromFact = fact => {
  const regex = /Room\{\{"(\w+)"/;
  const match = fact.match(regex)
  return match ? match[1] : null
}

const addBear = (state, bear) => {
  const next = structuredClone(state)
  next.bears.push(bear)
  return next
}

// bear can be an id or a bear object
const removeBear = (state, bear) => {
  const next = structuredClone(state)
  const bearId = typeof bear === 'string' ? bear : bear.id
  next.bears = next.bears.filter(b => b.id !== bearId)
  return next
}

const updateBear = (state, bear, update) => {
  const next = structuredClone(state)
  const bearId = typeof bear === 'string' ? bear : bear.id
  const idx = next.bears.findIndex(b => b.id === bearId)
  if (idx >= 0) {
    next.bears[idx] = {
      ...next.bears[idx],
      ...update,
    }
  }
  return next
}

const SteppedExperience = () => {
  const [facts, setFacts] = useState([])

  // individual viz states
  const [v1, setV1] = useState(initState())
  const [v2, setV2] = useState(initState())
  const [v3, setV3] = useState(initState())
  const [v4, setV4] = useState(initState())
  const [v5, setV5] = useState(initState())

  /* Uploaded facts */
  const [fact1Uploaded, setFact1Uploaded] = useState(false)
  const [fact2Uploaded, setFact2Uploaded] = useState(false)

  const [v3Facts, setV3Facts] = useState([
    'is_in(Room{{"bedroom-1"}, House{"cottage"})',
    'is_in(Room{{"bedroom-2"}, House{"cottage"})',
    'is_in(Room{{"kitchen"}, House{"cottage"})',
    'is_in(Room{{"living-room"}, House{"cottage"})',
  ])

  const [v4Facts, setV4Facts] = useState([
    'is_resident(Bear{"Yogi"}, House{"cottage"})',
    'is_resident(Bear{"Paddington"}, House{"cottage"})',
    'is_resident(Bear{"Winnie"}, House{"cottage"})',
  ])

  const [v5PolicyLines, setV5PolicyLines] = useState(policy)
  const [newV5PolicyLines, setNewV5PolicyLines] = useState([
    'actor Bear{}',
    ' ',
    'resource House{}',
    'resource Room{}',
    ' ',
    'has_permission(bear:Bear, "enter", room:Room) if',
    '  is_resident(Bear, house:House) and is_in(room, house) and not room = Room{"kitchen"};',
  ])

  useEffect(() => {
    // this if statement checks if we've finished the 4th viz and are onto the 5th
    if (v4.bears.length === 4 && v5.honeypots.length === 0) {
      const honeypot = generateHoneypot(v5)
      // TODO may need to set for further states
      applyAllStates(addHoneypot, honeypot, [setV5])
      // if no hungry bears, make at least one hungry
    }
  },[v4.bears, v5.honeypots])

  const addFact = (state, fact) => {
    const next = structuredClone(state)
    next.facts.push(fact)
    return next
  }

  const addRoom = (state, room) => {
    const next = structuredClone(state)
    next.rooms.push(room)
    return next
  }

  const addHoneypot = (state, honeypot) => {
    const next = structuredClone(state)
    next.honeypots.push(honeypot)
    return next
  }

  return (
    <div className="prose min-h-full mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header>
        <h1>Quickstart</h1>
      </header>
      <p>Welcome to Oso! Let's get you started on the journey to supercharge authorization in your application.</p>
      <h2>Build your first policy</h2>
      <p>The first thing you need on this journey is a policy. A policy contains the authorization logic that Oso Cloud will use to determine access.</p>
      <p>Authorization logic contains:</p>

      <ul>
        <li>
          Resources are the "who" and "what" of your application. The "who" are identified as <Pill>actors</Pill>, while the "what" are <Pill>resources</Pill>.
        </li>

        <li>
          Rules describing the authorization logic, usually in terms of <Pill>actor</Pill>s and <Pill>resource</Pill>s.
        </li>
      </ul>

      <p>Here we have a simple policy that defines a house for bears:</p>

      <div className="py-3">
        <Policy policyLines={policy} explainable />
      </div>

      <h2>Add data to support the policy</h2>
      <p>Policies operate on data in the form of facts. A fact is a piece of data that Oso uses to determine access. Facts are completely custom!</p>
      <p>Let's add a room to our house by uploading a fact to Oso Cloud:</p>

      <SingleFact
        style={{visibility: fact1Uploaded ? 'hidden' : null}}
        text={'is_in(Room{{"foyer"}, House{"cottage"})'}
        actionText="Upload fact"
        onClickAction={() => {
          const fact = 'is_in(Room{{"foyer"}, House{"cottage"})'
          applyAllStates(addFact, fact, [setV1, setV2, setV3, setV4, setV5])

          const room = generateRoom(v1.grid, roomNameFromFact(fact))
          if (room) {
            applyAllStates(addRoom, room, [setV1, setV2, setV3, setV4, setV5])
          }

          setFact1Uploaded(true)
        }}
      />

      <div className="mt-3 flex gap-3">
        <div>
          <div className="mb-3">
            <Policy policyLines={v1.policy} />
          </div>
          <Facts facts={v1.facts} />
        </div>
        <Viz
          state={v1}
          vizWidth={500}
          vizHeight={500}
          onChangeRooms={newRooms => {
            setV1(prev => setRooms(prev, newRooms))
          }}
          onChangeBears={newBears => setV1(prev => setBears(prev, newBears))}
          onChangeGrid={newGrid => setV1(prev => setGrid(prev, newGrid))}
        />
      </div>

      <p>Now let's add a resident to the house:</p>
      <SingleFact
        style={{visibility: fact2Uploaded ? 'hidden' : null}}
        text={'is_resident(Bear{"Smokey"}, House{"cottage"})'}
        actionText="Upload fact"
        onClickAction={() => {
          const fact = 'is_resident(Bear{"Smokey"}, House{"cottage"})'
          applyAllStates(addFact, fact, [setV2, setV3, setV4, setV5])

          const bear = generateBear(v2.grid)
          if (bear) {
            applyAllStates(addBear, bear, [setV2, setV3, setV4, setV5])
          }

          setFact2Uploaded(true)
        }}
      />

      <div className="mt-3 flex gap-3">
        <div>
          <div className="mb-3">
            <Policy policyLines={v2.policy} />
          </div>
          <Facts facts={v2.facts} />
        </div>
        <Viz
          state={v2}
          vizWidth={500}
          vizHeight={500}
          onChangeRooms={newRooms => {
            setV2(prev => setRooms(prev, newRooms))
          }}
          onChangeBears={newBears => {
            setV2(prev => setBears(prev, newBears))
          }}
          onChangeGrid={newGrid => setV2(prev => setGrid(prev, newGrid))}
        />
      </div>

      <p>
        The doors in our cottage are smart doors. Whenever a bear tries to enter a room, the doors of the room communicate with Oso Cloud for authorization information.
      </p>
      <p><i>TODO: add a zoomed-in/slow-mo viz representing communication with Oso Cloud</i></p>

      <p>If a bear is not allowed to enter a room, that bear will be denied entry.</p>

      <p>Let's add more rooms to our house...</p>
      <MultiFact
        facts={v3Facts}
        actionText="Upload fact"
        onClickAction={(f, i) => {
          applyAllStates(addFact, f, [setV3, setV4, setV5])
          const room = generateRoom(v3.grid, roomNameFromFact(f))
          if (room) {
            applyAllStates(addRoom, room, [setV3, setV4, setV5])
          }
          setV3Facts(prev => {
            const next = [...prev]
            next.splice(i, 1)
            return next
          })
        }}
      />

      <div className="mt-3 flex gap-3">
        <div>
          <div className="mb-3">
            <Policy policyLines={v3.policy} />
          </div>
          <Facts facts={v3.facts} />
        </div>
        <Viz
          state={v3}
          vizWidth={500}
          vizHeight={500}
          onChangeRooms={newRooms => {
            setV3(prev => setRooms(prev, newRooms))
          }}
          onChangeBears={newBears => {
            setV3(prev => setBears(prev, newBears))
          }}
          onChangeGrid={newGrid => setV3(prev => setGrid(prev, newGrid))}
        />
      </div>

      <p>...and more residents!</p>
      <MultiFact
        facts={v4Facts}
        actionText="Upload fact"
        onClickAction={(f, i) => {
          applyAllStates(addFact, f, [setV4, setV5])

          const bear = generateBear(v4.grid)
          if (bear) {
            applyAllStates(addBear, bear, [setV4, setV5])
          }
          setV4Facts(prev => {
            const next = [...prev]
            next.splice(i, 1)
            return next
          })
        }}
      />

      <div className="mt-3 flex gap-3">
        <div>
          <div className="mb-3">
            <Policy policyLines={v4.policy} />
          </div>
          <Facts facts={v4.facts} />
        </div>
        <Viz
          state={v4}
          vizWidth={500}
          vizHeight={500}
          onChangeRooms={newRooms => {
            setV4(prev => setRooms(prev, newRooms))
          }}
          onChangeBears={newBears => {
            setV4(prev => setBears(prev, newBears))
          }}
          onChangeGrid={newGrid => setV4(prev => setGrid(prev, newGrid))}
        />
      </div>

      <p>
        The bears seem to have found the honey in the kitchen! We need to keep the kitchen safe from honey-stealing bears.
      </p>

      <p>
        Let's modify our policy to prevent the bears from entering the kitchen:
      </p>
      <div className="my-3">
        <PolicyAction
          policy={[
            'has_permission(bear:Bear, "enter", room:Room) if,',
            '  is_resident(bear, house:House) and is_in(room, house) and not room = Room{"kitchen"};',
          ]}
          actionText="Update policy"
          onClickAction={() => {
            setV5PolicyLines(newV5PolicyLines)
            setNewV5PolicyLines([])
          }}
          style={{visibility: newV5PolicyLines.length === 0 ? 'hidden' : null}}
        />
      </div>

      <div className="mt-3 flex gap-3">
        <div>
          <div className="mb-3">
            <Policy policyLines={v5PolicyLines} />
          </div>
          <Facts facts={v5.facts} />
        </div>
        <Viz
          state={v5}
          vizWidth={500}
          vizHeight={500}
          onChangeRooms={newRooms => {
            setV5(prev => setRooms(prev, newRooms))
          }}
          onChangeBears={newBears => {
            setV5(prev => setBears(prev, newBears))
          }}
          onChangeGrid={newGrid => setV5(prev => setGrid(prev, newGrid))}
        />
      </div>
    </div>

  )
}

const policy2 = [
  { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
  ' ',
  { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
  ' ',
  {
    line: 'has_permission(bear:Bear, "enter", house:House) if',
    explanation: 'A rule stating that bears who are residents of the house can enter.'
  },
  '  is_resident(Bear, house:House);',
]

function ContainedViz({ options={} }) {
  const vizRef = useRef()

  const [startedBarrage, setStartedBarrage] = useState(options.barrage || false)
  const startedBarrageRef = useRef(startedBarrage)

  // map of bear id to bool (which is always true). if a bear id appears in this map, they've been animated for clearance
  const [clearedBears, setClearedBears] = useState({}) 
  const [isPaused, setIsPaused] = useState(options.isPaused || false)
  const [injectImposters, setInjectImposters] = useState(options.injectImposters || false)
  const [state, setState] = useState(
    initState({
      houses: [{ id: 'house-1', pos: { row: 5, col: 11 }}],
    })
  )

  const imposterRef = useRef(null)
  const pausedRef = useRef(isPaused)
  const showDoorClearanceAnimRef = useRef(options.showDoorClearanceAnim)

  // used for query animations
  const osoCloudRef = useRef(null)
  const policyRef = useRef(null)
  const overlayRef = useRef(null)

  // Function to generate a random interval between 1 and 3 seconds
  const getRandomInterval = () => Math.floor(Math.random() * (5000 - 2000 + 1)) + 1000;

  const startInjectingImposters = () => {
    // Clear any existing interval
    clearInterval(imposterRef.current)

    // Set a new interval with a random duration
    const randomInterval = getRandomInterval()

    imposterRef.current = setTimeout(() => {
      setState(prev => {
        let next = structuredClone(prev)
        const hasImposter = next.bears.find(b => b.type === 'imposter')
        if (!hasImposter && !pausedRef.current) {
          const [row, col] = getRandomStandingPosition(prev.grid)
          const nextImposter = newBear({
            pos: { row, col },
            movement: 'controlled',
            type: 'imposter',
          })
          next = addBear(next, nextImposter)
        }
        return next
      })
      if (injectImposters) {
        startInjectingImposters() // Recursively set the next random interval if still running
      }
    }, randomInterval)
  }

  const makeItFlyBack = ({ query, authorized }) => {
    // check if there's an active query, else return
    const houseBox = vizRef.current.getHouseBounds(state.houses[0].id)
    const osoBox = osoCloudRef.current.node.getBoundingClientRect()
    const overlay = d3.select(overlayRef.current)

    const queryContainer = overlay.select('.oso-query')
    if (queryContainer.empty()) {
      return
    }

    queryContainer.html(`<span><pre>${query}</pre></span>`)

    const startX = houseBox.left + houseBox.width / 2
    const startY = houseBox.top + houseBox.height / 2

    const qBox = queryContainer.node().getBoundingClientRect()
    const endX = osoBox.right - qBox.width - 15 // align right edge with 15 pad
    const endY = osoBox.top + 10 // 10 is vertical pad

    return new Promise(resolve => {
      queryContainer.transition()
        .style('background-color', authorized ? LIME_500: RED_500) // lime-500 and red-500
        .transition('fly-back')
        .duration(800)
        .ease(d3.easeCubicInOut)
      .style('left', `${startX}px`)
      .style('top', `${startY}px`)
        .on('end', () => {
          queryContainer
            .transition()
            .style('opacity', 0)
            .remove()
            .on('end', () => { resolve() })
        })
    })
  }

  const makeItFly = (query) => {
    const houseBox = vizRef.current.getHouseBounds(state.houses[0].id)
    const osoBox = osoCloudRef.current.node.getBoundingClientRect()
    const overlay = d3.select(overlayRef.current)

    const startX = houseBox.left + houseBox.width / 2
    const startY = houseBox.top + houseBox.height / 2

    const queryContainer = overlay.append('div').attr('class', 'oso-query')
      .style('position', 'fixed')
      .style('font-size', '12px')
      .style('left', `${startX}px`)
      .style('top', `${startY}px`)
      .style('display', 'flex')
      .style('padding', '3px 7px')
      .style('align-items', 'start')
      .style('justify-content', 'start')
      .style('color', 'black')
      .style('border-radius', '4px')
      .style('border', '2px solid black')
      .style('background-color', 'white')
      .style('z-index', 1000)
      .html(`<span><pre>${query}</pre></span>`)
      .style('opacity', '0')

    const qBox = queryContainer.node().getBoundingClientRect()
    const endX = osoBox.right - qBox.width - 15 // align right edge with 15 pad
    const endY = osoBox.top + 10 // 10 is vertical pad

    return new Promise((resolve) => {
      queryContainer.transition()
        .style('opacity', 1)
        .on('end', () => {
          queryContainer.transition('fly').duration(800)
          .style('left', `${endX}px`)
          .style('top', `${endY}px`)
          .on("end", () => {
            resolve()
          })
        })
    })
  }

  // cancel animations of later steps
  useEffect(() => {
    if (!options.policy && osoCloudRef.current) {
      osoCloudRef.current.cancelExecution()
      d3.select('.oso-query').transition().attr('opacity', 0).remove()
    }
  }, [options.policy])

  useEffect(() => {
    startedBarrageRef.current = startedBarrage
  }, [startedBarrage])

  useEffect(() => {
    showDoorClearanceAnimRef.current = options.showDoorClearanceAnim
  }, [options.showDoorClearanceAnim])


  useEffect(() => {
    if (isPaused) {
      vizRef.current.pause()
      // TODO, do we update the current position here or in the viz?
    } else {
      // go through each bear, reset the target, attach onBearEnterHouse
      state.bears.map(b => {
        console.log(b, b.movement)
        if (b.movement === 'controlled') {
          vizRef.current.moveBearToTarget(b.id, b.target, onBearEnterHouse)
        }
      })
    }
  }, [isPaused])

  useEffect(() => {
    pausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    if (injectImposters) {
      startInjectingImposters()
    }

    return () => clearInterval(imposterRef.current)
  }, [injectImposters])

  const onBearEnterHouse = enteredBear => {
    setState(prev => {
      const removedBear = enteredBear.datum()
      let next = removeBear(prev, removedBear)
      // figure out how to cancel current animation (this if statement does not work)
      if (startedBarrageRef.current && removedBear.type !== 'imposter') {
        const [row, col] = getRandomStandingPosition(next.grid)
        const nextBear = newBear({
          pos: { row, col },
          movement: 'controlled',
        })
        next = addBear(next, nextBear)
      }
      return next
    })
  }

  const barrage = () => {
    for (let i = 0; i < state.bears.length; i++) {
      vizRef.current.moveBearToTarget(
        state.bears[i].id,
        state.houses[0].id,
        onBearEnterHouse,
      )
    }
  }

  useEffect(() => {
    if (options.injectImposters) {
      setInjectImposters(true)
    } else {
      setInjectImposters(false)
    }
  }, [options.injectImposters])

  useEffect(() => {
    if (options.barrage) {
      setState(prev => {
        return addBear(prev, newBear({ pos: { row: 15, col: 13 }, movement: 'controlled' }))
      })
      setStartedBarrage(true)
    } else {
      setStartedBarrage(false)
      setState(prev => {
        return {
          ...prev,
          bears: [],
        }
      })
    }
  }, [options.barrage])

  useEffect(() => {
    let needsTarget = false
    for (let i = 0; i < state.bears.length; i++) {
      if (!state.bears[i].target && startedBarrageRef.current) {
        needsTarget = true
      }
    }

    if (needsTarget) {
      setState(prev => {
        const next = structuredClone(prev)
        for (let i = 0; i < state.bears.length; i++) {
          if (!state.bears[i].target && startedBarrageRef.current) {
            next.bears[i].target = next.houses[0]
            vizRef.current.moveBearToTarget(
              next.bears[i].id,
              next.houses[0].id,
              onBearEnterHouse,
            )
          }
        }
        return next
      })
    } else {
      //console.warn('NO TARGET NEEDED')
    }
  }, [state.bears, startedBarrage])

  useEffect(() => {
    if (startedBarrage) {
      barrage()
    }
  }, [startedBarrage])

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-x-2">
        { options.policy &&
            <OsoCloud
              ref={osoCloudRef}
              policy={options.policy}
              facts={options.facts}
            />
        }
        <Viz
          ref={vizRef}
          state={state}
          onChangeRooms={newRooms => {
            setState(prev => setRooms(prev, newRooms))
          }}
          onChangeBears={newBears => {
            setState(prev => setBears(prev, newBears))
          }}
          onChangeGrid={newGrid => {
            setState(prev => setGrid(prev, newGrid))
          }}
          onDoorClearanceNeeded={(selection, pos) => {
            if (showDoorClearanceAnimRef.current) {
              setIsPaused(true)
              const bearD = selection.datum()
              setClearedBears(prev => ({ ...prev, [bearD.id]: true }))
              const query = `Bear:${bearD.name} enter House:cottage`
              makeItFly(query)
                .then(() => {
                  osoCloudRef.current.execute(query)
                    .then(({ authorized }) => {
                      makeItFlyBack({ query, authorized })
                        .then(() => {
                          // change target of bear
                          if (!authorized) {
                            const [row, col] = getRandomPerimeterPosition(state.grid)
                            console.log('changing target', row, col)
                            setState(prev => updateBear(prev, bearD, { target: { row, col } }))
                          }
                          setIsPaused(false)
                        })
                    })
                })
                .catch(e => console.error('error', e))
            }
          }}
          isClearedForDoor={(d, { row, col }) => {
            if (!showDoorClearanceAnimRef || clearedBears[d.id]) {
              return true
            }
            return false
          }}
          vizWidth={500}
          vizHeight={333}
          options={options}
        />
      </div>
      <div className={`text-center mt-10 ${options?.message ? '' : 'invisible'} text-xl font-semibold`}>
        {options?.message ? options.message : 'Message'}
      </div>
      <div ref={overlayRef}></div>
    </div>
  )
}

function ContainedExperience() {
  const [step, setStep] = useState(0)


  const steps = [
    {
      message: 'Imagine your app is a house...',
      showBearNames: true,
      showHouseLabels: true,
      barrage: false,
    },
    {
      message: '...and your users are bears who reside in the house.',
      showBearNames: true,
      showBearLabels: true,
      barrage: true,
    },
    {
      message: 'There are certain types of bears who are not residents of the house whom we\'d like to keep out.',
      showBearNames: true,
      showBearLabels: (d, i) => {
        return d.type === 'imposter'
      },
      barrage: true,
      injectImposters: true,
    },
    {
      message: 'This is where Oso comes in.',
      showBearNames: true,
      showBearLabels: false,
      barrage: true,
      injectImposters: true,
    },
    {
      message: 'We can create a policy which describes our app',
      policy: [
        { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
        ' ',
        { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
        ' ',
      ],
      showBearNames: true,
      showBearLabels: false,
      showPolicyHighlights: true,
      barrage: true,
      injectImposters: true,
    },
    {
      message: 'And then we can add logic to protect our app',
      policy: [
        { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
        ' ',
        { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
        ' ',
        {
          line: 'has_permission(bear:Bear, "enter", house:House) if\n  is_resident(bear, house);',
          explanation: 'A rule stating that bears who are residents of the house can enter.'
        },
      ],
      showBearNames: true,
      showBearLabels: false,
      barrage: true,
      injectImposters: true,
    },
    {
      message: 'We can configure the house doors to make a request to Oso Cloud to authorize any bear trying to enter the house',
      policy: [
        { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
        ' ',
        { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
        ' ',
        {
          line: 'has_permission(bear:Bear, "enter", house:House) if\n  is_resident(bear, house);',
          explanation: 'A rule stating that bears who are residents of the house can enter.'
        },
      ],
      showBearNames: true,
      showBearLabels: false,
      barrage: true,
      injectImposters: true,
      isPaused: true,
      showDoorClearanceAnim: true,
    },
    {
      message: 'Then we can upload facts that describe the state of the app',
      policy: [
        { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
        ' ',
        { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
        ' ',
        {
          line: 'has_permission(bear:Bear, "enter", house:House) if\n  is_resident(bear, house);',
          explanation: 'A rule stating that bears who are residents of the house can enter.'
        },
      ],
      facts: [
        'is_resident(Bear{"Smokey"}, House{"cottage"})',
        'is_resident(Bear{"Yogi"}, House{"cottage"})',
        'is_resident(Bear{"Winnie"}, House{"cottage"})',
        'is_resident(Bear{"Teddy"}, House{"cottage"})',
      ],
      showBearNames: true,
      showBearLabels: false,
      barrage: true,
      injectImposters: true,
      showDoorClearanceAnim: true,
    },
    {
      message: 'And now our app is secure',
      policy: [
        { line: 'actor Bear{}', explanation: 'Who will be performing actions in our application.'},
        ' ',
        { line: 'resource House{}', explanation: 'What actors will be acting upon.' },
        ' ',
        {
          line: 'has_permission(bear:Bear, "enter", house:House) if\n  is_resident(bear, house);',
          explanation: 'A rule stating that bears who are residents of the house can enter.'
        },
      ],
      facts: [
        'is_resident(Bear{"Smokey"}, House{"cottage"})',
        'is_resident(Bear{"Yogi"}, House{"cottage"})',
        'is_resident(Bear{"Winnie"}, House{"cottage"})',
        'is_resident(Bear{"Teddy"}, House{"cottage"})',
      ],
      showBearNames: true,
      showBearLabels: false,
      barrage: true,
      injectImposters: true,
      showDoorClearanceAnim: true,
    },
  ]

  const isLastStep = step === steps.length-1
  return (
    <div className="pt-10">
      <h1>Oso</h1>
      <div className="flex justify-center">
        <ContainedViz options={steps[step]} />
      </div>
      <div className="flex justify-center items-center mt-20">
        <a
          onClick={() => setStep(prev => prev - 1)}
          className={`${step > 0 ? '' : 'invisible'} cursor-pointer text-2xl font-semibold text-gray-400 block py-6 px-20 rounded-lg`}
        >
          <span className="mx-1">‹</span>Previous
        </a>
        <a
          onClick={() => isLastStep ? null : setStep(prev => prev + 1)}
          className="cursor-pointer text-2xl font-bold block bg-gray-200 hover:bg-gray-300 py-6 px-20 rounded-lg"
        >
          {isLastStep ? 'View docs' : 'Next'}<span className="mx-1">›</span>
        </a>
      </div>
    </div>
  )
}

function V0() {
  // Force a full-page refresh. A self-contained html file doesn't seem to work without it
  useEffect(() => {
    window.location.replace('/v0.html')
  }, [])

  return null
}

// 
function V3() {
  const vizRef = useRef()
  const [isPaused, setIsPaused] = useState(false)
  const pausedRef = useRef(isPaused)

  // map of bear id to bool (which is always true). if a bear id appears in this map, they've been animated for clearance
  const [clearedBears, setClearedBears] = useState({}) 
  const [state, setState] = useState(
    initState({
      houses: [{ id: 'house-1', pos: { row: 5, col: 11 }}],
      databases: [{ id: 'db-1', pos: { row: 10, col: 21 }}],
      connections: [generateConnection('house-1', 'db-1')],
    })
  )

  const onBearEnterHouse = enteredBear => {
    const removedBear = enteredBear.datum()
    setState(prev => {
      return removeBear(prev, removedBear)
    })
  }

  useEffect(() => {
    pausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    setState(prev => {
      const next = structuredClone(prev || state)
      for (let i = 0; i < state.bears.length; i++) {
        if (!state.bears[i].target) {
          next.bears[i].target = next.houses[0]
          vizRef.current.moveBearToTarget(next.bears[i].id, next.houses[0].id, onBearEnterHouse)
        }
      }
      return next
    })
  }, [state.bears])

  useEffect(() => {
    if (isPaused) {
      vizRef.current.pause()
      // TODO, do we update the current position here or in the viz?
    } else {
      // go through each bear, research the target, attach onBearEnterHouse
      state.bears.map(b => {
        console.log(b)
        if (b.movement === 'controlled') {
          vizRef.current.moveBearToTarget(b.id, b.target, onBearEnterHouse)
        }
      })
    }
  }, [pausedRef.current])


  useEffect(() => {
    const interval = setInterval(() => {
      if (!pausedRef.current) {
        setState(prev => {
          return addBear(prev, newBear({ pos: { row: 21, col: 14 }, movement: 'controlled' }))
        })
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const request = () => {
    return vizRef.current.dbReqRes('house-1', 'db-1', {
      onReq: () => {
        console.log('req done!')
        return Promise.resolve()
      },
      onRes: () => {
        console.log('res done!')
      },
    })

  }

  return (
    <div className="prose min-h-full mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <button onClick={request}>Request</button>
      <Viz
        ref={vizRef}
        state={state}
        onDoorClearanceNeeded={(selection, pos) => {
          setIsPaused(true)
          const bearD = selection.datum()
          setClearedBears(prev => ({ ...prev, [bearD.id]: true }))
          const query = `Bear:${bearD.name} enter House:cottage`
          request().then(() => setIsPaused(false))
        }}
        isClearedForDoor={(d, { row, col }) => {
          if (clearedBears[d.id]) {
            return true
          }
          return false
        }}
      />
    </div>
  )
}

async function execScript(script, { symbols } = {}) {
  let res, err;

  try {
    const fn = new Function(...Object.keys(symbols), `
      ${script}

      async function wrappedSetup() {
        return new Promise(async resolve => {
          if (typeof setup === 'function') {
            resolve(await setup())
          } else {
            resolve()
          }
        })
      }

      async function wrappedDraw() {
        // Execute the user's draw function
        if (typeof draw === 'function') {
          await draw()
        }
      }

      //async function loop() {
      //  await wrappedDraw()
      //  requestAnimationFrame(loop)
      //}
      async function loop() {
        await wrappedDraw();
        // Force re-render to get fresh state
        await new Promise(resolve => requestAnimationFrame(resolve));
        loop();
      }

      wrappedSetup()
        .then(() => loop())
    `)
    res = await fn(...Object.values(symbols))
  } catch (error) {
    console.error('Error executing script:', error)
    err = error
  }
  return [res, err]
}

const getInitCode = () => {
  return `async function setup() {

}

async function draw() {

}
`
}

function getStorageValue(key, defaultValue, { parseJson=false }={}) {
  // getting stored value
  const saved = localStorage.getItem(key)
  const initial = parseJson ? JSON.parse(saved) : saved
  return initial ? initial : defaultValue
}

export const useLocalStorage = (key, defaultValue, { parseJson=false }={}) => {
  const [value, setValue] = useState(() => {
    return getStorageValue(key, defaultValue)
  });

  useEffect(() => {
    // storing input name
    localStorage.setItem(key, parseJson ? JSON.stringify(value) : value)
  }, [key, value])

  return [value, setValue]
};

const startState = () => {
  return initState({
    bears: [newBear({ movement: 'controlled' })]
  })
}

const Cedars = () => {
  const vizRef = useRef()
  const [state, setState] = useState(startState())
  const [code, setCode] = useLocalStorage('cedars-master-class-code', getInitCode())
  const [errors, setErrors] = useState(null)
  const [output, setOutput] = useState([])

  const onConsole = (...stuff) => {
    setOutput(prev => [...prev, stuff.join(' ')])
  }

  const bear = state.bears[0]

  useEffect(() => {
    localStorage.setItem('cedars-master-class-code', code)
  }, [code])

  const getGridValue = useCallback((pos) => {
    const grid = state.grid;
    if (grid && pos.row >= 0 && pos.row < grid.length && pos.col >= 0 && pos.col < grid[0].length) {
      return grid[pos.row][pos.col];
    } else {
      return null; // Or any other value to indicate out of bounds
    }
  }, [state.grid]);

  const lookLeft = useCallback(() => {
  return getGridValue({
    row: state.bears[0].pos.row,
    col: state.bears[0].pos.col - 1
  });
}, [state.bears, getGridValue]);

const lookRight = useCallback(() => {
  return getGridValue({
    row: state.bears[0].pos.row,
    col: state.bears[0].pos.col + 1,
  });
}, [state.bears, getGridValue]);

  const move = useCallback(getNewPos => {
    return new Promise(resolve => {
      setState(prev => {
        const bear = prev.bears[0];
        const newPos = getNewPos(bear.pos);

        // Immediately update local state first
        const next = structuredClone(prev);
        next.bears[0].pos = newPos;

        // Then trigger visual movement
        vizRef.current.moveBear(bear.id, newPos)
          .then(() => resolve(newPos))
          .catch(() => resolve(bear.pos));

        return next;  // This update happens synchronously
      });
    });
  }, []);

  const setColor = useCallback(color => {
    return new Promise(resolve => {
      setState(prev => {
        console.log('set color', color)
        const bear = prev.bears[0]
        const next = structuredClone(prev)
        console.log(next.grid)
        next.grid[bear.pos.row][bear.pos.col] = color
        resolve(next)
        return next
      })
      //setState(prev => {
      //  const bear = prev.bears[0];
      //  const newPos = getNewPos(bear.pos);

      //  // Immediately update local state first
      //  const next = structuredClone(prev);
      //  next.bears[0].pos = newPos;

      //  // Then trigger visual movement
      //  vizRef.current.moveBear(bear.id, newPos)
      //    .then(() => resolve(newPos))
      //    .catch(() => resolve(bear.pos));

      //  return next;  // This update happens synchronously
      //});
    });
  }, []);


  const goTo = useCallback((row, col) => {
    return new Promise((resolve, reject) => {
      setState(prev => {
        if (row >= prev.grid.length || col > prev.grid[0].length) {
          const err = `Cannot goTo(${row}, ${col}) because it is out of bounds for the grid`
          setErrors(err)
          reject(err)
          return prev
        }
        const bear = prev.bears[0];
        const next = structuredClone(prev)
        next.bears[0].pos = { row, col }
        resolve(next)
        return next;  // This update happens synchronously
      });
    });
  }, []);

  const setName = useCallback(newName => {
    return new Promise((resolve, reject) => {
      setState(prev => {
        const bear = prev.bears[0];
        const next = structuredClone(prev)
        next.bears[0].name = newName
        resolve(next)
        return next;  // This update happens synchronously
      });
    });
  }, []);


  const symbols = {
    goTo,
    setState,
    setColor,
    setName,
    pause: ms => {
      console.log('paused for', ms)
      new Promise(r => setTimeout(r, ms))
    },
    move,
    moveLeft: (steps=1) => {
      return move(currentPos => ({
        row: currentPos.row,
        col: currentPos.col - steps,
      }));
    },
    moveRight: (steps=1) => {
      return move(currentPos => ({
        row: currentPos.row,
        col: currentPos.col + steps,
      }));
    },
    moveDown: (steps=1) => {
      return move(currentPos => ({
        row: currentPos.row + steps,
        col: currentPos.col,
      }));
    },
    moveUp: (steps=1) => {
      return move(currentPos => ({
        row: currentPos.row - steps,
        col: currentPos.col,
      }));
    },
    lookLeft: () => lookLeft(state.grid, state.bears[0]),
    lookRight: () => lookRight(state.grid, state.bears[0]),
    lookUp: () => {
    },
    lookDown: () => {
    },
    console: {
      log: onConsole,
    }
  }

  const onRun = async () => {
    setOutput([])
    const [res, err] = await execScript(code, { symbols, setState })
    setErrors(err)
    onConsole(res)
  }

  const makeWall = ({ row, col }) => {
    setState(prev => {
      const next = structuredClone(prev)
      next.grid[row][col] = 1
      return next
    })
  }

  return (
    <div style={{maxWidth: 900}}>
    <div className="flex flex-col justify-center items-center gap-y-3">
      <Viz
        ref={vizRef}
        state={state}
        onChangeGrid={newGrid => setState(prev => setGrid(prev, newGrid))}
        onClickCell={makeWall}
      />
      <div className="w-full flex justify-end">
        <button onClick={onRun}>▶️ Run</button>
      </div>
      <CodeEditor initialCode={code} style={{width: 900 }} onChange={c => setCode(c)} />
      <div className="flex flex-col justify-start" style={{width: 900}}>
        <div className="text-red-500">{errors && String(errors)}</div>
        <div className="flex flex-col">
          <pre className="uppercase text-xs tracking-wider font-semibold">Console</pre>
          <div className="border border-black rounded-lg w-full min-h-40 max-h-90 py-3 overflow-y-scroll">
            {output.map((o, i) => <div key={i} className="px-3 border-b border-gray-200">{o}</div>)}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

function Home() {
  return (
    <div className="grid grid-cols-3">
      <Link to="/v0">
        <div className="border border-black rounded flex items-center justify-center p-3 mr-2 mb-2">
          v0
        </div>
      </Link>
      <Link to="/v1">
        <div className="border border-black rounded flex items-center justify-center p-3 mr-2 mb-2">
          v1
        </div>
      </Link>
      <Link to="/v2">
        <div className="border border-black rounded flex items-center justify-center p-3 mr-2 mb-2">
          v2
        </div>
      </Link>
      <Link to="/v3">
        <div className="border border-black rounded flex items-center justify-center p-3 mr-2 mb-2">
          v3
        </div>
      </Link>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter forceRefresh>
      <div className="min-h-full mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/v0" element={<V0 />} />
        <Route path="/v1" element={<SteppedExperience />} />
        <Route path="/v2" element={<ContainedExperience />} />
        <Route path="/v3" element={<V3 />} />
        <Route path="/contained" element={<Navigate to="/v2" replace />} />
        <Route path="/cedars" element={<Cedars />} />
      </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
