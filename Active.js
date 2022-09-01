export class Controller {
  #currentEffect
  #effectMap = new WeakMap()
  #reactive
  #$reactive
  /**
   * @param {Record<string,any>} reactive
   */
  constructor(reactive = {}) {
    this.#reactive = Object.fromEntries(Object.entries(reactive).map((entry) => {
      entry[1] = {
        value: entry[1]
      }
      return entry
    }))
    this.#$reactive = new Proxy(this.#reactive, {
      get: (target, p) => {
        if (!target[p]) {
          return undefined
        }
        const set = this.#effectMap.get(target[p]) ?? new Set()
        this.#effectMap.set(target[p], set)
        if (this.#currentEffect) {
          set.add(this.#currentEffect)
        }
        return target[p].value
      },
      set: (target, p, v) => {
        const set = this.#effectMap.get(target[p])
        target[p].value = v
        if (set) {
          for (const hook of set) {
            hook?.(this)
          }
        }

        return true
      }
    })
    Object.defineProperty(this, 'effect', {
      get: () => {
        return (hook) => {
          const run = () => {
            this.#currentEffect = hook
            hook?.(this)
          }
          run()
          return run
        }
      }
    })
  }

  getAllState() {
    return Object.fromEntries(Object.entries(this.#reactive).map(entry => {
      entry[1] = entry[1].value
      return entry
    }))
  }

  getState(name) {
    return this.#$reactive[name]
  }

  setState(name, value) {
    return this.#$reactive[name] = value
  }
}

function parsetDataAction(n, c, action) {
  if (Reflect.get(n, '$$parsetDataAction')) {
    return
  } else {
    Reflect.set(n, '$$parsetDataAction', true)
  }
  const actions = action.split(',')
  for (const action of actions) {
    const [actionName, methodName] = action.split('->')
    if (actionName && methodName) {
      if (typeof c[methodName] === 'function') {
        const m = c[methodName].bind(c)
        n.addEventListener(actionName, e => m.call(n, e, n?.dataset ?? {}))
      }
    }
  }
}

export function parseAttribute(n, c, map) {
  if (Reflect.get(n, '$$parseAttribute')) {
    return map
  } else {
    Reflect.set(n, '$$parseAttribute', true)
  }
  if (n instanceof HTMLElement) {
    const tempRegex = /\{\{(.+)\}\}/
    const attrNames = n.getAttributeNames()
    for (const name of attrNames) {
      if (name === 'data-action') {
        parsetDataAction(n, c, n.getAttribute('data-action'))
        n.removeAttribute(name)
        return map
      }
      if (name.indexOf(':') === 0 && tempRegex.test(n.getAttribute(name))) {
        const set = map.get(n) ?? new Set()
        map.set(n, set)
        const notBindName = name.slice(1)
        set.add({
          type: 'attr',
          key: notBindName,
          value: `${n.getAttribute(notBindName) ?? ''}` + n.getAttribute(name)
        })
        n.removeAttribute(name)
      }
    }
  }
  parseRoot(n, c, map)
  return map
}

function parseText(n, c, map) {
  if (Reflect.get(n, '$$parseText')) {
    return map
  } else {
    Reflect.set(n, '$$parseText', true)
  }
  if (n instanceof Text) {
    const tempRegex = /\{\{(.+)\}\}/
    if (tempRegex.test(n.textContent)) {
      const set = map.get(n) ?? new Set()
      map.set(n, set)
      set.add({
        type: 'text',
        value: n.textContent
      })
    }
    return map
  } else {
    parseRoot(n, c, map)
    return map
  }
}

function parseNode(n, c, map) {
  if (Reflect.get(n, '$$parseNode')) {
    return map
  } else {
    Reflect.set(n, '$$parseNode', true)
  }
  if (n instanceof Comment) {
    return map
  }
  parseText(n, c, map)
  parseAttribute(n, c, map)
  return map
}

function parseRoot(target, c, updateMap = new Map()) {
  if (Reflect.get(target, '$$parseRoot')) {
    return updateMap
  } else {
    Reflect.set(target, '$$parseRoot', true)
  }
  const childNodes = [...target.childNodes]
  for (const n of childNodes) {
    parseNode(n, c, updateMap)
  }
  return updateMap
}

function update(map, c) {
  for (const item of map.entries()) {
    const [target, templates] = item
    for (const temp of templates) {
      const tempRegex = /\{\{(.+)\}\}/
      const { type, key, value } = temp
      if (type === 'text') {
        const count = c.getState('count')
        let html = value
        let res = tempRegex.exec(html)
        while (res) {
          html = html.replace(res[0], c.getState(res[1]))
          res = tempRegex.exec(html)
        }
        target.textContent = html
      } else if (type === 'attr') {
        let attr = value
        let res = tempRegex.exec(attr)
        while (res) {
          attr = attr.replace(res[0], c.getState(res[1]))
          res = tempRegex.exec(attr)
        }
        target.setAttribute(key, attr)
      }
    }
  }
}

/**
 * @param {Array<new()=>Controller>} controllers
 */
export function setup(controllers) {
  if (!Array.isArray(controllers)) {
    throw new TypeError('controllers 必须是数组')
  }
  const ControllersMap = Object.fromEntries(controllers.filter(c => {
    if (typeof c !== 'function' || !Object.is(Reflect.getPrototypeOf(c.prototype), Controller.prototype)) {
      console.warn('过滤了非Controller子类')
      return false
    }
    return true
  }).map(c => {
    if (!/.+Controller$/.test(c.name)) {
      return [`${c.name}Controller`, c]
    }
    return [c.name, c]
  }))
  const controllerTargets = [...document.querySelectorAll('[data-controller]')]

  for (const target of controllerTargets) {
    const controllerName = target.getAttribute('data-controller') + 'Controller'
    const Controller = ControllersMap[controllerName]
    if (Controller) {
      const c = new Controller(Controller.reactive)
      const updateMap = parseRoot(target, c)
      c.effect(() => {
        update(updateMap, c)
      })
    }
  }
}
