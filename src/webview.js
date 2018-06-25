const WEBVIEW_TARGET = '@@WEBVIEW_TARGET';

const ID = () =>
  Math.random()
    .toString(32)
    .slice(2);

const flattenObject = object => {
  if (typeof object !== 'object') {
    return object;
  }
  const flatObject = {};
  for (const key in object) {
    flatObject[key] = object[key];
  }
  for (const key in Object.getOwnPropertyNames(object)) {
    flatObject[key] = object[key];
  }
  return flatObject;
};

class AutoScaledCanvas {
  constructor(element) {
    this.element = element;
  }

  toDataURL(...args) {
    return this.element.toDataURL(...args);
  }

  autoScale() {
    window.autoScaleCanvas(this.element);
  }

  get width() {
    return this.element.width;
  }

  set width(value) {
    this.element.width = value;
//     this.autoScale();
    return value;
  }

  get height() {
    return this.element.height;
  }

  set height(value) {
    this.element.height = value;
//     this.autoScale();
    return value;
  }
}

const toMessage = result => {
  if (result instanceof Blob) {
    return {
      type: 'blob',
      payload: btoa(result),
      meta: {},
    };
  }
  if (result instanceof Object) {
    if (!result[WEBVIEW_TARGET]) {
      const id = ID();
      result[WEBVIEW_TARGET] = id;
      targets[id] = result;
    }
    return {
      type: 'json',
      payload: flattenObject(result),
      meta: {
        target: result[WEBVIEW_TARGET],
        constructor: result.constructor.name,
      },
    };
  }
  return {
    type: 'json',
    payload: JSON.stringify(result),
    meta: {},
  };
};

// const print = (...args) => {
//   const a = JSON.stringify({
//     type: 'log',
//     payload: args,
//   });
//   postMessage(a);
// };

const canvas = document.createElement('canvas');
const autoScaledCanvas = new AutoScaledCanvas(canvas);

const targets = {
  canvas: autoScaledCanvas,
  context2D: canvas.getContext('2d'),
};

const constructors = {
  Image,
  Path2D,
};

const populateRefs = arg => {
  if (arg && arg.__ref__) {
    return targets[arg.__ref__];
  }
  return arg;
};

document.body.appendChild(canvas);

function handleMessage({id, type, payload}) {
  switch (type) {
    case 'exec': {
      const {target, method, args} = payload;
      const result = targets[target][method](...args.map(populateRefs));
      const message = toMessage(result);
      postMessage(JSON.stringify({id, ...message}));
      break;
    }
    case 'set': {
      const {target, key, value} = payload;
      targets[target][key] = populateRefs(value);
      break;
    }
    case 'construct': {
      const {constructor, id: target, args = []} = payload;
      const object = new constructors[constructor](...args);
      const message = toMessage({});
      targets[target] = object;
      postMessage(JSON.stringify({id, ...message}));
      break;
    }
    case 'listen': {
      const {types, target} = payload;
      for (const eventType of types) {
        targets[target].addEventListener(eventType, e => {
          const message = toMessage({
            type: 'event',
            payload: {
              type: e.type,
              target: {...flattenObject(targets[target]), [WEBVIEW_TARGET]: target},
            },
          });
          postMessage(JSON.stringify({id, ...message}));
        });
      }
      break;
    }
  }
}

const handleError = (err, message) => {
  postMessage(
    JSON.stringify({
      id: message.id,
      type: 'error',
      payload: {
        message: err.message,
      },
    }),
  );
  document.removeEventListener('message', handleIncomingMessage);
};

function handleIncomingMessage(e) {
  const data = JSON.parse(e.data);
  if (Array.isArray(data)) {
    for (const message of data) {
      try {
        handleMessage(message);
      } catch (err) {
        handleError(err, message);
      }
    }
  } else {
    try {
      handleMessage(data);
    } catch (err) {
      handleError(err, data);
    }
  }
}

document.addEventListener('message', handleIncomingMessage);
