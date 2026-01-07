/* ===============================
   1. INDENT PARSER
================================ */
export function parseIndentTree(code) {
  const lines = code.replace(/\t/g, "  ").split("\n").filter(l => l.trim());
  const root = { value: "root", indent: -1, children: [] };
  const stack = [root];

  for (const line of lines) {
    const indent = line.match(/^ */)[0].length;
    const value = line.trim();
    const node = { value, indent, children: [] };

    while (stack.at(-1).indent >= indent) stack.pop();
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  return root;
}

/* ===============================
   2. DOTWEB INTERPRETER (FULL)
================================ */
export class DotWeb {
  constructor() {
    this.components = {};
    this.builtins = ["ViewPort"];
    this.styles = new Set();
    this.scripts = [];
  }

  run(tree) {
    const result = tree.children.map(n => this.node(n, {})).join("");
    return result.startsWith("<!DOCTYPE html>") ? result : this.wrapInViewPort(result);
  }

  wrapInViewPort(content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DotWeb App</title>
  ${this.styles.size > 0 ? `<style>${Array.from(this.styles).join('\n')}</style>` : ''}
</head>
<body>
  ${content}
  ${this.scripts.length > 0 ? `<script>${this.scripts.join('\n\n')}</script>` : ''}
</body>
</html>`;
  }

  node(node, scope) {
    // Component definition
    if (node.value.startsWith("$component")) return this.component(node);

    // Slot
    if (node.value === "$slot") return scope.slot?.join("") || "";

    // Built-in components
    if (this.builtins.includes(node.value)) {
      return this.builtin(node, scope);
    }

    // Props inside struct should be ignored here
    if (node.value.startsWith("*")) return "";

    // User-defined component
    if (this.components[node.value]) return this.useComponent(node, scope);

    // HTML element
    if (/^[a-z]/.test(node.value)) return this.element(node, scope);

    // Text / Expression
    return this.text(node.value, scope);
  }

  /* ---------------- BUILT-IN COMPONENTS ---------------- */
  builtin(node, scope) {
    if (node.value === "ViewPort") {
      const props = {};
      const children = [];
      
      // Parse ViewPort props
      node.children.forEach(c => {
        if (c.value.startsWith("*")) {
          const parts = c.value.slice(1).split(" ");
          const key = parts[0];
          let value = parts.slice(1).join(" ").trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          props[key] = value;
        } else {
          children.push(c);
        }
      });

      const content = children.map(c => this.node(c, scope)).join("");
      
      return `<!DOCTYPE html>
<html lang="${props.lang || "en"}">
<head>
  <meta charset="${props.charset || "UTF-8"}">
  <meta name="viewport" content="${props.viewport || "width=device-width, initial-scale=1.0"}">
  ${props.title ? `<title>${props.title}</title>` : "<title>DotWeb App</title>"}
  ${props.description ? `<meta name="description" content="${props.description}">` : ""}
  ${props.keywords ? `<meta name="keywords" content="${props.keywords}">` : ""}
  ${props.author ? `<meta name="author" content="${props.author}">` : ""}
  ${props.styles ? props.styles.split(",").map(s => `<link rel="stylesheet" href="${s.trim()}">`).join("\n  ") : ""}
  ${this.styles.size > 0 ? `<style>${Array.from(this.styles).join('\n')}</style>` : ''}
  ${props.scripts ? props.scripts.split(",").map(s => `<script src="${s.trim()}"></script>`).join("\n  ") : ""}
</head>
<body>
  ${content}
  ${this.scripts.length > 0 ? `<script>${this.scripts.join('\n\n')}</script>` : ''}
</body>
</html>`;
    }
    return "";
  }

  /* ---------------- COMPONENT DEFINITIONS ---------------- */
  /* ---------------- COMPONENT DEFINITIONS ---------------- */
/* ---------------- COMPONENT DEFINITIONS ---------------- */
component(node) {
  const name = node.value.split(" ")[1];
  const def = { struct: null, style: null, class: null, name };
  
  node.children.forEach(c => {
    if (c.value === "*struct") def.struct = c;
    else if (c.value === "*style") def.style = c;
    else if (c.value.startsWith("*class")) def.class = c;
  });
  
  this.components[name] = def;
  
  // Add component styles to global styles (support both single-line or block)
  if (def.style) {
    this.styles.add(`/* Styles for ${name} */`);
    
    if (def.style.children.length > 0) {
      // BLOCK styles
      def.style.children.forEach(child => this.styles.add(child.value));
    } else {
      // SINGLE-LINE style
      const raw = def.style.value.trim();
      const inlineStyle = raw.includes(" ") ? raw.split(" ").slice(1).join(" ") : "";
      if (inlineStyle) this.styles.add(inlineStyle);
    }
  }
  
  // Add component class behaviors to global scripts
  if (def.class) {
    const className = name.charAt(0).toUpperCase() + name.slice(1) + "Component";
    let classCode = `class ${className} {\n`;
    
    def.class.children.forEach(child => {
      if (child.value === "constructor") {
        classCode += `  constructor(element) {\n`;
        child.children.forEach(line => { classCode += `    ${line.value}\n`; });
        classCode += `  }\n`;
      } else if (child.value.includes("(") && child.value.includes(")")) {
        classCode += `  ${child.value} {\n`;
        child.children.forEach(line => { classCode += `    ${line.value}\n`; });
        classCode += `  }\n`;
      } else {
        classCode += `  ${child.value}\n`;
      }
    });
    
    classCode += `}\n\n`;
    classCode += `document.addEventListener('DOMContentLoaded', () => {\n`;
    classCode += `  document.querySelectorAll('[data-component="${name}"]').forEach(el => {\n`;
    classCode += `    new ${className}(el);\n`;
    classCode += `  });\n`;
    classCode += `});`;
    
    this.scripts.push(classCode);
  }
  
  return "";
}

  /* ---------------- COMPONENT USAGE ---------------- */
  useComponent(node, parentScope) {
    const comp = this.components[node.value];
    if (!comp.struct) return "";

    const props = {};
    const slotNodes = [];
    const blockProps = {};

    // First pass: collect props and slots
    node.children.forEach(c => {
      if (c.value.startsWith("*")) {
        const parsed = this.parseProp(c, parentScope);
        if (parsed.isBlock) {
          blockProps[parsed.key] = parsed.value;
        } else {
          props[parsed.key] = parsed.value;
        }
      } else {
        slotNodes.push(c);
      }
    });

    // Create scope with regular props
    const scope = { ...props };
    
    // Evaluate slot with current scope
    scope.slot = slotNodes.map(c => this.node(c, scope));
    
    // Now evaluate block props in the proper scope
    Object.keys(blockProps).forEach(key => {
      const blockNode = blockProps[key];
      scope[key] = blockNode.children.map(child => this.node(child, scope)).join("");
    });

    // Render component struct with complete scope
    const content = comp.struct.children.map(n => this.node(n, scope)).join("");
    
    // Wrap in data-component attribute for JavaScript targeting
    return `<div data-component="${comp.name}">${content}</div>`;
  }

  /* ---------------- PROP PARSING (TYPED + BLOCK) ---------------- */
  parseProp(c, parentScope) {
    const raw = c.value.slice(1).trim();
    const match = raw.match(/^([a-zA-Z0-9_]+)(?:<([a-zA-Z0-9_]+)>)?(?:\s+(.+))?/);
    if (!match) throw `Invalid prop syntax: ${c.value}`;
    const [_, key, type = "any", inlineValue] = match;

    // BLOCK PROP
    if (c.children.length > 0) {
      if (type !== "Component") 
        throw `Block input allowed only for <Component> prop: ${key}`;
      return { 
        key, 
        value: c,
        isBlock: true 
      };
    }

    // SINGLE-LINE PROP
    if (inlineValue !== undefined) {
      let value = inlineValue.trim();

      // Expression in {}
      if (value.startsWith("{") && value.endsWith("}")) {
        const expr = value.slice(1, -1);
        try {
          value = Function("scope", `with(scope){return ${expr.replace(/\$([a-zA-Z0-9_]+)/g, '$1')}}`)(parentScope);
        } catch (e) {
          throw `Expression error in prop ${key}: ${e.message}`;
        }
      } else if (type === "string") {
        value = value.replace(/^"|"$/g, "");
      } else if (type === "number") {
        value = Number(value);
      } else if (type === "boolean") {
        if (value !== "true" && value !== "false") 
          throw `Invalid boolean value for ${key}`;
        value = value === "true";
      } else if (type === "Component") {
        throw `Block required for <Component> prop: ${key}`;
      }

      return { key, value, isBlock: false };
    }

    throw `Prop ${key} requires a value`;
  }

  /* ---------------- HTML ELEMENT ---------------- */
  element(node, scope) {
    const firstSpace = node.value.indexOf(' ');
    let tagRaw, rest;
    
    if (firstSpace === -1) {
      tagRaw = node.value;
      rest = '';
    } else {
      tagRaw = node.value.substring(0, firstSpace);
      rest = node.value.substring(firstSpace + 1);
    }

    const { tag, attrs } = this.parseElement(tagRaw);
    
    // Process inline content
    let children = '';
    if (rest) {
      children = this.text(rest, scope);
    }
    
    // Process nested children
    children += node.children.map(c => this.node(c, scope)).join("");
    
    return `<${tag}${attrs}>${children}</${tag}>`;
  }

  parseElement(raw) {
    let tag = raw;
    let attrs = "";

    // class
    if (raw.includes(".")) {
      const parts = raw.split(".");
      tag = parts[0];
      attrs += ` class="${parts.slice(1).join(" ")}"`;
    }

    // id
    if (raw.includes("#")) {
      const [t, id] = raw.split("#");
      tag = t;
      attrs += ` id="${id}"`;
    }

    // other attributes
    const attrMatch = raw.match(/\[(.+?)\]/);
    if (attrMatch) {
      attrMatch[1].split(",").forEach(p => {
        const [k, v] = p.split("=");
        attrs += ` ${k}="${v}"`;
      });
    }

    return { tag, attrs };
  }

  /* ---------------- TEXT / EXPRESSION ---------------- */
  text(val, scope) {
    val = val.trim();
    
    if (val.startsWith("{") && val.endsWith("}")) {
      const expr = val.slice(1, -1);
      try {
        const processedExpr = expr.replace(/\$([a-zA-Z0-9_]+)/g, '$1');
        return String(Function("scope", `with(scope){return ${processedExpr}}`)(scope));
      } catch (e) {
        console.warn("Expression error:", val, e);
        return "";
      }
    }
    
    if (val.includes("{")) {
      return val.replace(/\{([^}]+)\}/g, (match, expr) => {
        try {
          const processedExpr = expr.replace(/\$([a-zA-Z0-9_]+)/g, '$1');
          return String(Function("scope", `with(scope){return ${processedExpr}}`)(scope));
        } catch (e) {
          console.warn("Expression error:", match, e);
          return "";
        }
      });
    }
    
    if (val.startsWith("$")) {
      const varName = val.slice(1);
      return scope[varName] ?? "";
    }
    
    return val;
}
}