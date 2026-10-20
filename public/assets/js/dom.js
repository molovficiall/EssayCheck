export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (name === 'className') element.className = value;
    else if (name.startsWith('on') && typeof value === 'function')
      element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === 'style' && typeof value === 'string') {
      const match = /^background-color:(#[0-9a-f]{6})$/i.exec(value);
      if (match) element.style.setProperty('background-color', match[1]);
    } else if (value !== false && value !== null && value !== undefined)
      element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child instanceof Node) element.append(child);
    else if (child !== null && child !== undefined)
      element.append(document.createTextNode(String(child)));
  }
  return element;
}
