import { useState, useRef, useEffect } from 'react';
import './CodeEditor.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

function CodeEditor() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [lineCount, setLineCount] = useState(2);
  const [breakpoints, setBreakpoints] = useState(new Set());
  const [debuggerState, setDebuggerState] = useState({
    active: false,
    currentLine: null,
    evaluatedLines: [],
    pausedAt: null,
    running: false
  });
  const textareaRef = useRef(null);
  const editorRef = useRef(null);
  
  useEffect(() => {
    // Count lines in the code
    const lines = code.split('\n');
    setLineCount(lines.length);
  }, [code]);

  const handleCodeChange = (e) => {
    setCode(e.target.value);
    // Reset debugger when code changes
    if (debuggerState.active) {
      setDebuggerState({
        active: false,
        currentLine: null,
        evaluatedLines: [],
        pausedAt: null,
        running: false
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      
      // Insert 2 spaces for tab
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      
      // Set cursor position after the inserted tab
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const toggleBreakpoint = (lineNumber) => {
    const newBreakpoints = new Set(breakpoints);
    if (newBreakpoints.has(lineNumber)) {
      newBreakpoints.delete(lineNumber);
    } else {
      newBreakpoints.add(lineNumber);
    }
    setBreakpoints(newBreakpoints);
  };

  const executeCode = () => {
    // If debugger is active and paused, resume execution
    if (debuggerState.active && debuggerState.pausedAt) {
      resumeExecution();
      return;
    }
    
    // If debugger is active and running, pause execution
    if (debuggerState.active && debuggerState.running) {
      pauseExecution();
      return;
    }
    
    // Otherwise, start fresh execution
    setOutput(''); // Clear previous output
    
    if (breakpoints.size === 0) {
      // No breakpoints, run normally
      runCodeWithoutDebugger();
    } else {
      // Has breakpoints, run with debugger
      startDebugger();
    }
  };

  const runCodeWithoutDebugger = () => {
    // Capture console.log output
    const originalConsoleLog = console.log;
    const logs = [];
    
    console.log = (...args) => {
      logs.push(args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' '));
      originalConsoleLog(...args);
    };
    
    try {
      // Execute the code using eval instead of Function constructor
      const result = eval(code);
      
      if (logs.length > 0) {
        setOutput(logs.join('\n'));
      } else if (result !== undefined) {
        setOutput(String(result));
      } else {
        setOutput('Code executed successfully with no output.');
      }
    } catch (error) {
      setOutput(`Error: ${error.message}`);
    } finally {
      // Restore original console.log
      console.log = originalConsoleLog;
    }
  };

  const startDebugger = () => {
    const codeLines = code.split('\n');
    
    // Reset debugger state
    setDebuggerState({
      active: true,
      currentLine: 0,
      evaluatedLines: [],
      pausedAt: null,
      running: true
    });
    
    // Execute the code line by line
    setTimeout(() => {
      executeNextLine(codeLines, 0, []);
    }, 100);
  };

  const executeNextLine = (codeLines, lineIndex, logs) => {
    if (lineIndex >= codeLines.length) {
      // End of code
      finishDebuggerExecution(logs);
      return;
    }

    // Update current line first to show visual feedback
    setDebuggerState(prevState => ({
      ...prevState,
      currentLine: lineIndex
    }));

    // Check if we hit a breakpoint at the current line
    if (breakpoints.has(lineIndex + 1)) {
      // Execute the current line before pausing
      const currentLine = codeLines[lineIndex].trim();
      if (currentLine && !currentLine.startsWith('//')) {
        try {
          // Capture console.log output
          const originalConsoleLog = console.log;
          console.log = (...args) => {
            const logMessage = args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            logs.push(logMessage);
            
            // Update output in real-time
            setOutput(logs.join('\n'));
            
            originalConsoleLog(...args);
          };

          // Special handling for console.log statements
          if (currentLine.startsWith('console.log')) {
            const match = currentLine.match(/console\.log\((.*)\)/);
            if (match && match[1]) {
              const args = match[1].trim();
              // Handle string literals and other expressions
              try {
                // If it's a string literal, preserve it
                if ((args.startsWith('"') && args.endsWith('"')) || 
                    (args.startsWith("'") && args.endsWith("'"))) {
                  console.log(eval(args)); // Directly eval the string
                } else {
                  // For other expressions
                  const value = eval(args);
                  console.log(value);
                }
              } catch (e) {
                // Fallback to direct eval of the line
                eval(currentLine);
              }
            }
          }

          console.log = originalConsoleLog;
        } catch (error) {
          // Handle execution errors
          logs.push(`Error at line ${lineIndex + 1}: ${error.message}`);
          setOutput(logs.join('\n'));
        }
      }

      // Now pause at breakpoint
      setDebuggerState(prevState => ({
        ...prevState,
        currentLine: lineIndex,
        pausedAt: lineIndex + 1,
        running: false
      }));
      
      // Add breakpoint message at the end of current output
      setOutput(current => current ? `${current}\nPaused at breakpoint (line ${lineIndex + 1})` : `Paused at breakpoint (line ${lineIndex + 1})`);
      return;
    }

    // Check if execution is manually paused
    if (!debuggerState.running) {
      setDebuggerState(prevState => ({
        ...prevState,
        currentLine: lineIndex,
        pausedAt: lineIndex + 1,
        running: false
      }));
      return;
    }

    // Skip empty lines and lines with only comments
    const currentLine = codeLines[lineIndex].trim();
    if (!currentLine || currentLine.startsWith('//')) {
      const newEvaluatedLines = [...debuggerState.evaluatedLines, lineIndex];
      setDebuggerState(prevState => ({
        ...prevState,
        currentLine: lineIndex + 1,
        evaluatedLines: newEvaluatedLines,
        running: true
      }));
      executeNextLine(codeLines, lineIndex + 1, logs);
      return;
    }

    // Execute this line
    try {
      const originalConsoleLog = console.log;
      console.log = (...args) => {
        const logMessage = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        logs.push(logMessage);
        
        // Update output in real-time
        setOutput(logs.join('\n'));
        
        originalConsoleLog(...args);
      };

      // Try to execute the current line with eval
      try {
        if (currentLine && !currentLine.startsWith('//')) {
          // Special handling for console.log statements
          if (currentLine.startsWith('console.log')) {
            // Extract the arguments from console.log()
            const match = currentLine.match(/console\.log\((.*)\)/);
            if (match && match[1]) {
              const args = match[1].trim();
              // Handle string literals and other expressions
              try {
                // If it's a string literal, preserve it
                if ((args.startsWith('"') && args.endsWith('"')) || 
                    (args.startsWith("'") && args.endsWith("'"))) {
                  console.log(eval(args)); // Directly eval the string
                } else {
                  // For other expressions
                  const value = eval(args);
                  console.log(value);
                }
              } catch (e) {
                // Fallback to direct eval of the line
                eval(currentLine);
              }
            } else {
              // Empty console.log
              console.log();
            }
          } else {
            // For non-console.log statements
            const result = eval(currentLine);
            
            // If the line returned a value
            if (result !== undefined) {
              logs.push(String(result));
              setOutput(logs.join('\n'));
            }
          }
        }
      } catch (lineError) {
        // Some lines may not be executable individually, which is fine
      }

      console.log = originalConsoleLog;

      // Mark line as evaluated and continue to next line
      const newEvaluatedLines = [...debuggerState.evaluatedLines, lineIndex];
      setDebuggerState(prevState => ({
        ...prevState,
        evaluatedLines: newEvaluatedLines,
        currentLine: lineIndex + 1,
        running: true
      }));

      // Check if this is the last line
      if (lineIndex === codeLines.length - 1) {
        // Short delay to show the final line highlighted before finishing
        setTimeout(() => {
          finishDebuggerExecution(logs);
        }, 500);
        return;
      }

      // Continue after a short delay to visualize execution
      setTimeout(() => {
        executeNextLine(codeLines, lineIndex + 1, logs);
      }, 300);

    } catch (error) {
      setOutput(`${logs.join('\n')}\nError at line ${lineIndex + 1}: ${error.message}`);
      setDebuggerState(prevState => ({
        ...prevState,
        active: false,
        running: false
      }));
    }
  };

  const finishDebuggerExecution = (logs) => {
    setDebuggerState({
      active: false,
      currentLine: null,
      evaluatedLines: [],
      pausedAt: null,
      running: false
    });
    
    if (logs.length > 0) {
      setOutput(logs.join('\n'));
    } else {
      setOutput('Code executed successfully with no output.');
    }
  };

  const resumeExecution = () => {
    if (!debuggerState.active) return;

    const codeLines = code.split('\n');
    // When resuming from a breakpoint, start at the next line
    const currentIndex = debuggerState.pausedAt ? debuggerState.pausedAt : debuggerState.currentLine;
    
    // Resume from the current paused position
    setDebuggerState({
      ...debuggerState,
      pausedAt: null,
      running: true
    });
    
    // Get existing logs from output by removing the pause message
    let existingOutput = output;
    if (existingOutput.includes('Paused at breakpoint') || existingOutput.includes('Execution paused')) {
      existingOutput = existingOutput.split('\n')
        .filter(line => !line.includes('Paused at breakpoint') && !line.includes('Execution paused'))
        .join('\n');
    }
    const logs = existingOutput ? existingOutput.split('\n') : [];
    
    // Continue execution from the current line
    setTimeout(() => {
      executeNextLine(codeLines, currentIndex, logs);
    }, 10);
  };

  const pauseExecution = () => {
    if (!debuggerState.active || !debuggerState.running) return;
    
    setDebuggerState({
      ...debuggerState,
      running: false
    });
    
    setOutput(current => current ? 
      `${current}\nExecution paused manually at line ${debuggerState.currentLine + 1}` : 
      `Execution paused manually at line ${debuggerState.currentLine + 1}`);
  };

  const stepOver = () => {
    if (!debuggerState.active || debuggerState.running) return;
    
    runToNextBreakpoint();
  };

  const runToNextBreakpoint = () => {
    if (!debuggerState.active || debuggerState.running) return;
    
    const codeLines = code.split('\n');
    // If already at a breakpoint, we need to move to the next line
    const currentIndex = debuggerState.pausedAt ? debuggerState.pausedAt : debuggerState.currentLine;
    
    // Get existing logs from output by removing any pause messages
    let existingOutput = output;
    if (existingOutput.includes('Paused at breakpoint') || existingOutput.includes('Execution paused')) {
      existingOutput = existingOutput.split('\n')
        .filter(line => !line.includes('Paused at breakpoint') && !line.includes('Execution paused'))
        .join('\n');
    }
    const logs = existingOutput ? existingOutput.split('\n') : [];
    
    // Start continuous execution mode
    setDebuggerState({
      ...debuggerState,
      pausedAt: null,
      running: true
    });
    
    // Continue execution until the next breakpoint
    continueToNextBreakpoint(codeLines, currentIndex, logs);
  };

  const continueToNextBreakpoint = (codeLines, startIndex, logs) => {
    // Create a function to handle the next line
    const processNextLine = (index) => {
      // Stop if we've reached the end of the code
      if (index >= codeLines.length) {
        finishDebuggerExecution(logs);
        return;
      }
      
      // Execute the current line and capture output
      executeLineAndCaptureLogs(codeLines[index], index, logs);
      
      // Update current line
      setDebuggerState(prevState => ({
        ...prevState,
        currentLine: index
      }));
      
      // Check if we hit a breakpoint (after executing the current line)
      if (breakpoints.has(index + 1) && index !== startIndex - 1) {
        // Pause at the breakpoint
        setDebuggerState({
          ...debuggerState,
          currentLine: index,
          pausedAt: index + 1,
          running: false
        });
        
        // Add breakpoint message
        setOutput(current => {
          const filteredOutput = current.split('\n')
            .filter(line => !line.includes('Paused at breakpoint') && !line.includes('Execution paused'))
            .join('\n');
          return filteredOutput ? `${filteredOutput}\nPaused at breakpoint (line ${index + 1})` : 
            `Paused at breakpoint (line ${index + 1})`;
        });
        return;
      }
      
      // Move to the next line
      setTimeout(() => {
        processNextLine(index + 1);
      }, 10);
    };
    
    // Start processing from the startIndex
    processNextLine(startIndex);
  };
  
  const executeLineAndCaptureLogs = (line, lineIndex, logs) => {
    if (!line || line.trim().startsWith('//')) return;
    
    line = line.trim();
    
    try {
      const originalConsoleLog = console.log;
      console.log = (...args) => {
        const logMessage = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        logs.push(logMessage);
        
        // Update output in real-time
        setOutput(logs.join('\n'));
        
        originalConsoleLog(...args);
      };
      
      // Special handling for console.log statements
      if (line.startsWith('console.log')) {
        const match = line.match(/console\.log\((.*)\)/);
        if (match && match[1]) {
          const args = match[1].trim();
          // Handle string literals and other expressions
          try {
            // If it's a string literal, preserve it
            if ((args.startsWith('"') && args.endsWith('"')) || 
                (args.startsWith("'") && args.endsWith("'"))) {
              console.log(eval(args)); // Directly eval the string
            } else {
              // For other expressions
              const value = eval(args);
              console.log(value);
            }
          } catch (e) {
            // Fallback to direct eval of the line
            eval(line);
          }
        } else {
          // Empty console.log
          console.log();
        }
      } else {
        // For non-console.log statements
        const result = eval(line);
        
        // If the line returned a value
        if (result !== undefined) {
          logs.push(String(result));
          setOutput(logs.join('\n'));
        }
      }
      
      console.log = originalConsoleLog;
    } catch (error) {
      // Handle execution errors
      logs.push(`Error at line ${lineIndex + 1}: ${error.message}`);
      setOutput(logs.join('\n'));
    }
  };

  const restartDebugger = () => {
    if (!debuggerState.active) return;
    
    setOutput('');
    setTimeout(() => {
      startDebugger();
    }, 10);
  };

  // Initialize with default example code
  useEffect(() => {
    // Set initial code example
    setCode('console.log("one");');
  }, []);

  return (
    <div className="code-editor">
      <div className="editor-container">
        <div className="line-numbers">
          {Array.from({ length: lineCount }, (_, i) => (
            <div 
              key={i + 1} 
              className={`line-number ${debuggerState.currentLine === i ? 'current-line' : ''}`}
            >
              <div 
                className={`breakpoint ${breakpoints.has(i + 1) ? 'active' : ''}`}
                onClick={() => toggleBreakpoint(i + 1)}
              ></div>
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="editor-with-highlighting" ref={editorRef}>
          <SyntaxHighlighter
            language="javascript"
            style={vscDarkPlus}
            className="syntax-highlighter"
            wrapLines={true}
            showLineNumbers={false}
            customStyle={{
              margin: 0,
              padding: '10px',
              backgroundColor: 'transparent',
              fontSize: '14px',
              lineHeight: 1.5,
              minHeight: '200px',
              position: 'absolute',
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              pointerEvents: 'none'
            }}
            lineProps={lineNumber => {
              const style = { display: 'block' };
              if ((lineNumber - 1) === debuggerState.currentLine) {
                style.backgroundColor = 'rgba(120, 170, 255, 0.2)';
              }
              return { style };
            }}
          >
            {code}
          </SyntaxHighlighter>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            className="code-input"
            spellCheck="false"
            style={{
              background: 'transparent',
              color: 'transparent',
              caretColor: 'white'
            }}
            disabled={debuggerState.active}
          />
        </div>
      </div>
      <div className="debug-controls">
        <button 
          onClick={executeCode} 
          className={`run-button ${debuggerState.active ? (debuggerState.running ? 'pause' : 'resume') : ''}`}
        >
          {debuggerState.active 
            ? (debuggerState.running ? 'Pause' : 'Resume') 
            : 'Run Code'}
        </button>
        
        {debuggerState.active && (
          <>
            <button 
              onClick={stepOver} 
              className="debug-button step-over" 
              disabled={debuggerState.running}
            >
              Run to Next Breakpoint
            </button>
            <button onClick={restartDebugger} className="debug-button restart">
              Restart
            </button>
          </>
        )}
      </div>
      <div className="output-container">
        <h3>Output:</h3>
        <textarea
          readOnly
          value={output}
          className="output-area"
          placeholder="Code output will appear here..."
        />
      </div>
    </div>
  );
}

export default CodeEditor; 