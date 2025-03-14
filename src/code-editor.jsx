import React, { useState, useEffect, useRef } from 'react'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { vim } from '@replit/codemirror-vim'
import { Switch } from '@headlessui/react'

const CodeEditor = ({ initialCode = "// Write your JavaScript code here", allowVim=false, onChange, ...props }) => {
  const editorRef = useRef(null); // Reference to the DOM element
  const [editorView, setEditorView] = useState(null)
  const [isVimMode, setIsVimMode] = useState(false)

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    // Create the initial state for the editor
    const startState = EditorState.create({
      doc: initialCode,
      extensions: [
        keymap.of(defaultKeymap),
        javascript(), // Adds JavaScript language support
        oneDark,
        //drawSelection(), // possibly Ensure selection rendering for vim visual mode
        EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            const newCode = update.state.doc.toString()
            if (onChange) {
              // Notify parent of changes
              onChange(newCode) 
            }
          }
        }),
      ],
    })

    // Create the editor view and attach it to the DOM element
    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    })

    setEditorView(view)

    // Cleanup function to destroy the editor when the component unmounts
    return () => {
      view.destroy()
    }
  }, [editorRef])

  const toggleVimMode = () => {
    if (!editorView) {
      return
    }

    setIsVimMode(prev => !prev)

    const newExtensions = [
      javascript(),
      oneDark,
      EditorView.lineWrapping,
      ...(isVimMode ? [] : [vim()]), // Add or remove Vim extension
    ]

    const newState = EditorState.create({
      doc: editorView.state.doc.toString(), // Preserve current content
      extensions: newExtensions,
    })

    editorView.setState(newState) // Update the editor state
  }

  return (
    <div {...props}>
      {allowVim &&
      <div className="flex items-center mb-4 space-x-4">
        <Switch
          checked={isVimMode}
          onChange={toggleVimMode}
          className={`${isVimMode ? "bg-blue-600" : "bg-gray-200"}
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
        >
          <span className="sr-only">Toggle Vim Mode</span>
          <span
            className={`${
                isVimMode ? "translate-x-3" : "translate-x-0"
              } inline-block h-4 w-4 transform rounded-full bg-white transition`}
          />
        </Switch>
        <span className="ml-2 text-gray-700">
          Vim mode
        </span>
      </div>
      }
      <div
        ref={editorRef}
        className="rounded-xl h-full border border-black overflow-auto focus:ring-2 focus:ring-blue-500"
        style={{ 
          height: "300px", 
          backgroundColor: "#282c34", // Match One Dark theme background color
        }}
      />
    </div>
  )
}

export default CodeEditor

//import React, { useEffect, useRef } from "react";
//import { EditorState } from "@codemirror/state";
//import { EditorView, keymap } from "@codemirror/view";
//import { defaultKeymap } from "@codemirror/commands";
//import { javascript } from "@codemirror/lang-javascript";
//import { oneDark } from "@codemirror/theme-one-dark";
//
//const CodeEditor = () => {
//  const editorRef = useRef(null);
//
//  useEffect(() => {
//    if (!editorRef.current) return;
//
//    // Create the editor state
//    const startState = EditorState.create({
//      doc: "// Write your JavaScript code here",
//      extensions: [
//        keymap.of(defaultKeymap), // Default keyboard shortcuts
//        javascript(), // JavaScript syntax highlighting
//        oneDark, // Optional: One Dark theme
//        EditorView.lineWrapping, // Optional: Enable line wrapping
//      ],
//    });
//
//    // Create the editor view
//    const view = new EditorView({
//      state: startState,
//      parent: editorRef.current,
//    });
//
//    return () => {
//      view.destroy(); // Cleanup on unmount
//    };
//  }, []);
//
//  return <div ref={editorRef} style={{ border: "1px solid #ccc", height: "300px" }} />;
//};
//
//export default CodeEditor;

