import { DotWeb, parseIndentTree } from "./dotweb.js";

// DOM Elements
const editor = document.getElementById('editor');
const highlight = document.getElementById('highlight');
const preview = document.getElementById('preview');
const filenameInput = document.getElementById('filename');
const fileStatus = document.getElementById('file-status');
const lineNumbers = document.querySelector('.line-numbers-content');
const consoleOutput = document.getElementById('console-output');

// Buttons
const runBtn = document.getElementById('run');
const exportCodeBtn = document.getElementById('export-code');
const exportHtmlBtn = document.getElementById('export-html');
const exportConsoleBtn = document.getElementById('console-export');
const newFileBtn = document.getElementById('new-file');
const loadFileBtn = document.getElementById('load-file');
const refreshBtn = document.getElementById('refresh');
const previewReloadBtn = document.getElementById('preview-reload');
const themeToggle = document.getElementById('theme-toggle');
const fullscreenBtn = document.getElementById('fullscreen');
const previewFullscreenBtn = document.getElementById('preview-fullscreen');
const fileInput = document.getElementById('file-input');
const clearConsoleBtn = document.getElementById('console-clear');
const consoleToggleBtn = document.getElementById('console-toggle');
const deviceBtns = document.querySelectorAll('.device-btn');
const navBtns = document.querySelectorAll('.nav-btn');

// State
let currentTheme = localStorage.getItem('theme') || 'light';
let currentDevice = 'mobile';
let isUnsaved = false;
let isRunning = false;
let consoleExpanded = true;
let autoSaveTimeout = null;

// Initialize
init();

function init() {
    applyTheme();
    setupEventListeners();
    loadInitialContent();
    updateAll();
    setupConsoleCapture();
    
    // Auto-save check
    setInterval(checkAutoSave, 30000);
    
    // Initial run
    setTimeout(runCode, 500);
}

function setupEventListeners() {
    // Editor events
    editor.addEventListener('input', handleEditorInput);
    editor.addEventListener('keydown', handleKeydown);
    editor.addEventListener('scroll', syncScroll);
    editor.addEventListener('compositionend', () => syncHighlight());
    
    // File operations
    newFileBtn.addEventListener('click', createNewFile);
    loadFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileLoad);
    filenameInput.addEventListener('change', updateFilename);
    filenameInput.addEventListener('input', () => {
        fileStatus.textContent = 'unsaved';
        fileStatus.classList.add('unsaved');
        isUnsaved = true;
    });
    
    // Export buttons
    exportCodeBtn.addEventListener('click', exportDotWebFile);
    exportHtmlBtn.addEventListener('click', exportHtmlFile);
    exportConsoleBtn.addEventListener('click', exportConsoleLogs);
    
    // Run/Preview
    runBtn.addEventListener('click', runCode);
    refreshBtn.addEventListener('click', runCode);
    previewReloadBtn.addEventListener('click', () => {
        if (preview.contentWindow) {
            preview.contentWindow.location.reload();
            logToConsole('Preview reloaded', 'info');
        }
    });
    
    // Theme & UI
    themeToggle.addEventListener('click', toggleTheme);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    previewFullscreenBtn.addEventListener('click', togglePreviewFullscreen);
    
    // Console
    clearConsoleBtn.addEventListener('click', clearConsole);
    consoleToggleBtn.addEventListener('click', toggleConsole);
    
    // Device preview
    deviceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            deviceBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDevice = btn.dataset.device;
            updateDevicePreview();
        });
    });
    
    // Mobile navigation
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.dataset.panel;
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchPanel(panel);
        });
    });
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', handleGlobalShortcuts);
}

function handleGlobalShortcuts(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        runCode();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewFile();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        toggleTheme();
    }
}

function handleEditorInput(e) {
    isUnsaved = true;
    fileStatus.textContent = 'unsaved';
    fileStatus.classList.add('unsaved');
    
    // Update everything
    updateLineNumbers();
    syncHighlight();
    updateStats();
    
    // Auto-indent on new line
    if (e.inputType === 'insertLineBreak') {
        setTimeout(autoIndent, 10);
    }
    
    // Sync scroll after a tiny delay
    setTimeout(syncScroll, 0);
    
    // Debounce auto-save
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(saveToLocalStorage, 1000);
}

function autoIndent() {
    const cursorPos = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    
    if (currentLineIndex === 0) return;
    
    const previousLine = lines[currentLineIndex - 1];
    const indentMatch = previousLine.match(/^(\s*)/);
    let indent = indentMatch ? indentMatch[1] : '';
    
    // Increase indent for opening blocks
    if (previousLine.trim().endsWith('{') || 
        previousLine.trim().endsWith('*struct') ||
        previousLine.trim().endsWith('*style') ||
        previousLine.trim().endsWith('*class')) {
        indent += '  ';
    }
    
    // Decrease indent for closing braces
    const currentLineText = editor.value.split('\n')[currentLineIndex] || '';
    if (currentLineText.trim() === '}') {
        if (indent.length >= 2) {
            indent = indent.slice(0, -2);
        }
    }
    
    if (indent) {
        editor.setRangeText(indent, cursorPos, cursorPos, 'end');
    }
}

function handleKeydown(e) {
    // Tab key for indentation
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        
        if (e.shiftKey) {
            // Unindent
            const selection = editor.value.substring(start, end);
            const lines = selection.split('\n');
            const unindented = lines.map(line => {
                if (line.startsWith('  ')) {
                    return line.substring(2);
                }
                if (line.startsWith('\t')) {
                    return line.substring(1);
                }
                return line;
            }).join('\n');
            
            editor.setRangeText(unindented, start, end, 'select');
        } else {
            // Indent
            if (start === end) {
                // Single cursor
                editor.setRangeText('  ', start, start, 'end');
            } else {
                // Multiple lines selected
                const selection = editor.value.substring(start, end);
                const lines = selection.split('\n');
                const indented = lines.map(line => '  ' + line).join('\n');
                editor.setRangeText(indented, start, end, 'select');
            }
        }
        
        syncHighlight();
    }
    
    // Auto-close brackets and quotes
    const bracketPairs = {
        '(': ')',
        '[': ']',
        '{': '}',
        '"': '"',
        "'": "'",
        '`': '`'
    };
    
    if (bracketPairs[e.key] && editor.selectionStart === editor.selectionEnd) {
        e.preventDefault();
        const cursorPos = editor.selectionStart;
        const closing = bracketPairs[e.key];
        editor.setRangeText(e.key + closing, cursorPos, cursorPos, 'end');
        editor.setSelectionRange(cursorPos + 1, cursorPos + 1);
        syncHighlight();
    }
    
    // Delete matching pairs
    if (e.key === 'Backspace' || e.key === 'Delete') {
        const cursorPos = editor.selectionStart;
        const nextChar = editor.value.charAt(cursorPos);
        const prevChar = editor.value.charAt(cursorPos - 1);
        
        const pairs = ['()', '[]', '{}', '""', "''", '``'];
        const pair = pairs.find(p => p[0] === prevChar && p[1] === nextChar);
        
        if (pair && e.key === 'Backspace') {
            e.preventDefault();
            editor.setRangeText('', cursorPos - 1, cursorPos + 1, 'end');
            syncHighlight();
        }
    }
}

function syncScroll() {
    const scrollTop = editor.scrollTop;
    const scrollLeft = editor.scrollLeft;
    
    highlight.scrollTop = scrollTop;
    highlight.scrollLeft = scrollLeft;
    
    const lineNumbersContainer = document.getElementById('line-numbers');
    lineNumbersContainer.scrollTop = scrollTop;
}

function updateLineNumbers() {
    const code = editor.value;
    const lines = code.split('\n').length;
    
    let numbersHTML = '';
    for (let i = 1; i <= lines; i++) {
        numbersHTML += `<div class="line-number">${i}</div>`;
    }
    
    document.getElementById('line-numbers').innerHTML = numbersHTML;
    
    // Sync heights
    const editorHeight = editor.scrollHeight;
    highlight.style.height = editorHeight + 'px';
    
    const lineNumbersDiv = document.getElementById('line-numbers');
    lineNumbersDiv.style.height = editorHeight + 'px';
    
    // Update counter
    document.getElementById('line-count').textContent = lines;
}
function syncHighlight() {
    const code = editor.value;
    const lines = code.split('\n');
    
    // Clear and rebuild highlight layer
    let highlightedHTML = '';
    
    lines.forEach((line, index) => {
        // Preserve whitespace exactly
        if (line === '') {
            highlightedHTML += '<br>';
        } else {
            // Process highlighting but preserve exact characters
            const processedLine = highlightDotWebSyntax(line);
            
            // Replace tabs with spaces for consistent display
            const tabReplaced = processedLine.replace(/\t/g, '    ');
            
            // Wrap in a div with exact character positioning
            highlightedHTML += `<div class="highlight-line">${tabReplaced}</div>`;
        }
    });
    
    highlight.innerHTML = highlightedHTML;
    
    // Match exact dimensions
    highlight.style.height = editor.scrollHeight + 'px';
    highlight.style.width = editor.scrollWidth + 'px';
    
    // Force reflow to ensure proper positioning
    highlight.offsetHeight;
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightDotWebSyntax(line) {
    if (!line || line.trim() === '') {
        return '&nbsp;';
    }
    
    let result = escapeHtml(line);
    
    // Apply highlighting in specific order
    const patterns = [
        // Comments
        { 
            regex: /(\/\/.*)/g, 
            replace: '<span class="comment">$1</span>' 
        },
        // Strings
        { 
            regex: /(["'`])(?:(?=(\\?))\2.)*?\1/g, 
            replace: '<span class="string">$&</span>' 
        },
        // Keywords
        { 
            regex: /\b(ViewPort|component|struct|style|class|constructor|return|if|else|for|while|function|let|const|var)\b/g, 
            replace: '<span class="keyword">$&</span>' 
        },
        // Directives
        { 
            regex: /\*(\w+)/g, 
            replace: '<span class="function">*$1</span>' 
        },
        // Variables
        { 
            regex: /\$[a-zA-Z_]\w*/g, 
            replace: '<span class="variable">$&</span>' 
        },
        // HTML tags
        { 
            regex: /\b(div|span|p|h[1-6]|a|button|input|form|ul|ol|li|img|section|article|nav|header|footer|main|aside|figure|figcaption|blockquote|pre|code|strong|em|small|mark|del|ins|sub|sup)\b/g, 
            replace: '<span class="tag">$&</span>' 
        },
        // Numbers
        { 
            regex: /\b\d+(\.\d+)?\b/g, 
            replace: '<span class="number">$&</span>' 
        },
        // Expressions
        { 
            regex: /\{([^}]+)\}/g, 
            replace: '<span class="operator">{$1}</span>' 
        }
    ];
    
    patterns.forEach(pattern => {
        result = result//.replace(pattern.regex, pattern.replace);
    });
    
    return result;
}

function updateStats() {
    const code = editor.value;
    const chars = code.length;
    const lines = code.split('\n').length;
    const components = (code.match(/\$component\s+\w+/g) || []).length;
    
    document.getElementById('char-count').textContent = chars.toLocaleString();
    document.getElementById('line-count').textContent = lines;
    document.getElementById('component-count').textContent = components;
}

function runCode() {
    try {
        isRunning = true;
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running';
        runBtn.disabled = true;
        
        const code = editor.value;
        const tree = parseIndentTree(code);
        const app = new DotWeb();
        const html = app.run(tree);
        
        // Update preview
        preview.srcdoc = html;
        
        // Mark as saved
        isUnsaved = false;
        fileStatus.textContent = 'saved';
        fileStatus.classList.remove('unsaved');
        
        logToConsole('✓ Code executed successfully', 'info');
        
        // Save to localStorage
        saveToLocalStorage();
        
    } catch (error) {
        logToConsole(`✗ Error: ${error.message || error}`, 'error');
        console.error('DotWeb Runtime Error:', error);
        
        // Show error in preview
        preview.srcdoc = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        padding: 2rem;
                        background: #fee;
                        color: #c00;
                    }
                    pre {
                        background: #fff;
                        padding: 1rem;
                        border-radius: 0.5rem;
                        overflow: auto;
                    }
                </style>
            </head>
            <body>
                <h1>DotWeb Runtime Error</h1>
                <p><strong>${error.message || error}</strong></p>
                ${error.stack ? `<pre>${error.stack}</pre>` : ''}
            </body>
            </html>
        `;
    } finally {
        setTimeout(() => {
            runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
            runBtn.disabled = false;
            isRunning = false;
        }, 500);
    }
}

function createNewFile() {
    if (isUnsaved && !confirm('You have unsaved changes. Create new file anyway?')) {
        return;
    }
    
    editor.value = `$component App
  *struct
    div.container
      h1 Welcome to DotWeb
      p Edit this file to build your app
      button#demo { $buttonText }
      $slot
  
  *style
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      font-family: system-ui, sans-serif;
    }
    h1 {
      color: #3b82f6;
      margin-bottom: 1rem;
    }
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 1rem;
    }
  
  *class
    constructor(element) {
      this.element = element;
      this.button = element.querySelector('button');
      this.button.addEventListener('click', () => {
        alert('Button clicked!');
      });
    }

ViewPort
  *title "My DotWeb App"
  
  App
    *buttonText<string> "Click Me!"
    
    h2 Start building your app
    
    p This is a sample DotWeb application.
    
  *style
    body {
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }`;
    
    filenameInput.value = 'app.web';
    updateFilename();
    syncHighlight();
    updateLineNumbers();
    updateStats();
    logToConsole('New file created', 'info');
}

function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.web') && !file.name.endsWith('.dw')) {
        alert('Please select a .web or .dw file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        editor.value = e.target.result;
        filenameInput.value = file.name;
        updateFilename();
        syncHighlight();
        updateLineNumbers();
        updateStats();
        runCode();
        logToConsole(`Loaded: ${file.name}`, 'info');
    };
    reader.readAsText(file);
    
    // Reset file input
    fileInput.value = '';
}

function updateFilename() {
    const filename = filenameInput.value.trim();
    if (!filename.endsWith('.web')) {
        filenameInput.value = filename + '.web';
    }
    localStorage.setItem('dotweb_filename', filenameInput.value);
}

function exportDotWebFile() {
    const code = editor.value;
    const filename = filenameInput.value.trim();
    const finalFilename = filename.endsWith('.web') ? filename : filename + '.web';
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logToConsole(`Exported: ${finalFilename}`, 'info');
}

function exportHtmlFile() {
    try {
        const code = editor.value;
        const tree = parseIndentTree(code);
        const app = new DotWeb();
        const html = app.run(tree);
        
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameInput.value.replace('.web', '.html');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        logToConsole('HTML exported successfully', 'info');
    } catch (error) {
        logToConsole(`Export failed: ${error.message}`, 'error');
    }
}

function exportConsoleLogs() {
    const logs = Array.from(consoleOutput.querySelectorAll('.console-message'))
        .map(msg => msg.textContent)
        .join('\n');
    
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'console-logs.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logToConsole('Console logs exported', 'info');
}

function setupConsoleCapture() {
    preview.addEventListener('load', () => {
        try {
            const script = `
                (function() {
                    const originalLog = console.log;
                    const originalError = console.error;
                    const originalWarn = console.warn;
                    const originalInfo = console.info;
                    
                    function sendToParent(level, args) {
                        const message = Array.from(args).map(arg => {
                            if (typeof arg === 'object') {
                                try {
                                    return JSON.stringify(arg, null, 2);
                                } catch {
                                    return String(arg);
                                }
                            }
                            return String(arg);
                        }).join(' ');
                        
                        window.parent.postMessage({
                            type: 'CONSOLE_MESSAGE',
                            level: level,
                            message: message,
                            timestamp: new Date().toISOString()
                        }, '*');
                    }
                    
                    console.log = function(...args) {
                        sendToParent('log', args);
                        originalLog.apply(console, args);
                    };
                    
                    console.error = function(...args) {
                        sendToParent('error', args);
                        originalError.apply(console, args);
                    };
                    
                    console.warn = function(...args) {
                        sendToParent('warn', args);
                        originalWarn.apply(console, args);
                    };
                    
                    console.info = function(...args) {
                        sendToParent('info', args);
                        originalInfo.apply(console, args);
                    };
                    
                    // Error handling
                    window.addEventListener('error', function(event) {
                        sendToParent('error', [event.error]);
                    });
                    
                    window.addEventListener('unhandledrejection', function(event) {
                        sendToParent('error', [event.reason]);
                    });
                })();
            `;
            
            const scriptEl = preview.contentDocument.createElement('script');
            scriptEl.textContent = script;
            preview.contentDocument.head.appendChild(scriptEl);
        } catch (e) {
            // Cross-origin restrictions may prevent this
        }
    });
    
    // Listen for console messages
    window.addEventListener('message', (event) => {
        if (event.data.type === 'CONSOLE_MESSAGE') {
            logToConsole(event.data.message, event.data.level);
        }
    });
}

function logToConsole(message, level = 'log') {
    const timestamp = new Date().toLocaleTimeString();
    const messageDiv = document.createElement('div');
    messageDiv.className = `console-message ${level}`;
    messageDiv.innerHTML = `
        <span class="timestamp">[${timestamp}]</span>
        <span class="message">${escapeHtml(message)}</span>
    `;
    
    consoleOutput.appendChild(messageDiv);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    
    // Limit console messages
    const messages = consoleOutput.querySelectorAll('.console-message');
    if (messages.length > 100) {
        messages[0].remove();
    }
}

function clearConsole() {
    consoleOutput.innerHTML = `
        <div class="console-message info">
            <span class="timestamp">[${new Date().toLocaleTimeString()}]</span>
            <span class="message">Console cleared</span>
        </div>
    `;
}

function toggleConsole() {
    const consoleContainer = document.querySelector('.console-container');
    const toggleIcon = consoleToggleBtn.querySelector('i');
    
    consoleExpanded = !consoleExpanded;
    
    if (consoleExpanded) {
        consoleContainer.classList.remove('collapsed');
        toggleIcon.className = 'fas fa-chevron-up';
    } else {
        consoleContainer.classList.add('collapsed');
        toggleIcon.className = 'fas fa-chevron-down';
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme();
    themeToggle.innerHTML = currentTheme === 'light' 
        ? '<i class="fas fa-moon"></i>' 
        : '<i class="fas fa-sun"></i>';
    logToConsole(`Theme: ${currentTheme}`, 'info');
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
        document.exitFullscreen();
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    }
}

function togglePreviewFullscreen() {
    const previewWrapper = document.getElementById('preview-wrapper');
    previewWrapper.classList.toggle('fullscreen');
    
    if (previewWrapper.classList.contains('fullscreen')) {
        previewFullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        document.querySelector('.preview-frame-container').style.maxWidth = '100%';
        document.querySelector('.preview-frame-container').style.height = '100%';
    } else {
        previewFullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        updateDevicePreview();
    }
}

function updateDevicePreview() {
    const frameContainer = document.querySelector('.preview-frame-container');
    const wrapper = document.getElementById('preview-wrapper');
    
    if (wrapper.classList.contains('fullscreen')) return;
    
    switch (currentDevice) {
        case 'mobile':
            frameContainer.style.maxWidth = '375px';
            frameContainer.style.height = '667px';
            wrapper.style.justifyContent = 'center';
            break;
        case 'tablet':
            frameContainer.style.maxWidth = '768px';
            frameContainer.style.height = '1024px';
            wrapper.style.justifyContent = 'center';
            break;
        case 'desktop':
            frameContainer.style.maxWidth = '100%';
            frameContainer.style.height = '100%';
            wrapper.style.justifyContent = 'flex-start';
            break;
    }
}

function switchPanel(panel) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    if (panel === 'console') {
        document.querySelector('.console-container').classList.remove('collapsed');
        consoleExpanded = true;
        consoleToggleBtn.querySelector('i').className = 'fas fa-chevron-up';
    }
    
    if (panel === 'editor') {
        document.querySelector('.editor-panel').classList.add('active');
        document.querySelector(`.nav-btn[data-panel="editor"]`).classList.add('active');
    } else if (panel === 'preview') {
        document.querySelector('.preview-panel').classList.add('active');
        document.querySelector(`.nav-btn[data-panel="preview"]`).classList.add('active');
    } else if (panel === 'console') {
        document.querySelector('.preview-panel').classList.add('active');
        document.querySelector(`.nav-btn[data-panel="console"]`).classList.add('active');
    }
}

function saveToLocalStorage() {
    localStorage.setItem('dotweb_code', editor.value);
    localStorage.setItem('dotweb_filename', filenameInput.value);
    logToConsole('Auto-saved to browser storage', 'info');
}

function checkAutoSave() {
    if (isUnsaved && !isRunning) {
        saveToLocalStorage();
    }
}

function loadInitialContent() {
    const savedCode = localStorage.getItem('dotweb_code');
    const savedFilename = localStorage.getItem('dotweb_filename') || 'app.web';
    
    if (savedCode) {
        editor.value = savedCode;
        filenameInput.value = savedFilename;
        logToConsole('Loaded from browser storage', 'info');
    } else {
        // Default starter code
        editor.value = `$component Card
  *struct
    div.card
      h3 { $title }
      p { $description }
      button.view-btn View Details
  
  *style
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 12px rgba(0,0,0,0.15);
    }
    .card h3 {
      color: #1e293b;
      margin: 0 0 12px 0;
    }
    .card p {
      color: #64748b;
      line-height: 1.6;
      margin: 0 0 20px 0;
    }
    .card button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }
  
  *class
    constructor(element) {
      this.element = element;
      this.button = element.querySelector('button');
      this.button.addEventListener('click', () => {
        alert('Card clicked!');
      });
    }

ViewPort
  *title "DotWeb App"
  
  div.container
    h1 Welcome to DotWeb
    p A modern web development framework
    
    Card
      *title<string> "Component System"
      *description<string> "Build reusable components with structure, style, and behavior"
    
    Card
      *title<string> "Live Preview"
      *description<string> "See changes instantly with the built-in preview"
    
  *style
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 40px;
      background: #f8fafc;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      color: #1e293b;
      margin-bottom: 16px;
    }
    p {
      color: #64748b;
      margin-bottom: 40px;
      font-size: 18px;
    }`;
        
        filenameInput.value = savedFilename;
    }
    
    syncHighlight();
    updateLineNumbers();
}

function updateAll() {
    updateLineNumbers();
    syncHighlight();
    updateStats();
    syncScroll();
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    logToConsole('DotWeb IDE ready', 'info');
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
});