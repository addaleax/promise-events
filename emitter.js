'use strict';

const events = require('events');


const EventEmitter = module.exports = class EventEmitter extends events.EventEmitter {
  constructor() {
    super();

    this._resultFilter = this._resultFilter || undefined;
  }


  get maxListeners() {
    return this.getMaxListeners();
  }

  set maxListeners(n) {
    this.setMaxListeners(n);
  }


  getResultFilter() {
    return this.resultFilter;
  }

  setResultFilter(filter) {
    this.resultFilter = filter;

    return this;
  }

  get resultFilter() {
    return this._resultFilter === undefined && EventEmitter.defaultResultFilter || this._resultFilter;
  }

  set resultFilter(filter) {
    if (filter !== undefined && filter !== null && typeof filter !== 'function') {
      throw new TypeError('Filter must be a function');
    }

    this._resultFilter = filter;
  }


  emit(type) {
    // keep a reference to _resultFilter since the filter function
    // could theoretically set a new result filter, leading to
    // undefined results
    const resultFilter = this.getResultFilter();
    let er, handlers, len, args, events, domain;
    let needDomainExit = false;
    let doError = (type === 'error');
    let emitter = this;
    let promise;

    events = this._events;

    if (events) {
      doError = (doError && events.error == null);
    } else if (!doError) {
      return Promise.resolve();
    }

    domain = this.domain;

    // If there is no 'error' event listener then reject
    if (doError) {
      er = arguments[1];

      if (er) {
        if (!(er instanceof Error)) {
          // At least give some kind of context to the user
          let err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
          err.context = er;
          er = err;
        }
      } else {
        er = new Error('Uncaught, unspecified "error" event.');
      }

      if (domain) {
        er.domainEmitter = this;
        er.domain = domain;
        er.domainThrown = false;
        domain.emit('error', er);
      }

      return Promise.reject(er);
    }

    handlers = events[type];

    if (!handlers) {
      return Promise.resolve();
    }

    if (domain && this !== process) {
      domain.enter();
      needDomainExit = true;
    }

    if (typeof handlers === 'function') {
      handlers = [handlers];
    } else {
      handlers = handlers.slice();
    }

    len = arguments.length;
    switch (len) {
      // fast cases
      case 1:
        promise = Promise.all(handlers.map(function (handler) {
          try {
            return handler.call(emitter);
          } catch (err) {
            return Promise.reject(err);
          }
        }));
        break;
      case 2:
        args = arguments;
        promise = Promise.all(handlers.map(function (handler) {
          try {
            return handler.call(emitter, args[1]);
          } catch (err) {
            return Promise.reject(err);
          }
        }));
        break;
      case 3:
        args = arguments;
        promise = Promise.all(handlers.map(function (handler) {
          try {
            return handler.call(emitter, args[1], args[2]);
          } catch (err) {
            return Promise.reject(err);
          }
        }));
        break;
      case 4:
        args = arguments;
        promise = Promise.all(handlers.map(function (handler) {
          try {
            return handler.call(emitter, args[1], args[2], args[3]);
          } catch (err) {
            return Promise.reject(err);
          }
        }));
        break;
      // slower
      default:
        args = new Array(len - 1);
        for (let i = 1; i < len; ++i) {
          args[i - 1] = arguments[i];
        }
        promise = Promise.all(handlers.map(function (handler) {
          try {
            return handler.apply(emitter, args);
          } catch (err) {
            return Promise.reject(err);
          }
        }));
    }

    if (needDomainExit) {
      promise.then(function () {
        domain.exit();
      });
    }

    if (!resultFilter) {
      // unfiltered version
      return promise;
    }

    return promise.then(function(results) {
      return results.filter(resultFilter);
    });
  }


  addListener(type, listener) {
    let m;
    let events;
    let existing;
    let promise;

    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }

    events = this._events;

    if (!events) {
      events = this._events = {};
      this._eventsCount = 0;
    } else {
      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (events.newListener) {
        promise = this.emit('newListener', type, listener.listener ? listener.listener : listener);
      }
      existing = events[type];
    }

    if (!existing) {
      // Optimize the case of one listener. Don\'t need the extra array object.
      existing = events[type] = listener;
    } else {
      if (typeof existing === 'function') {
        // Adding the second element, need to change to array.
        existing = events[type] = [existing, listener];
      } else {
        // If we've already got an array, just append.
        existing.push(listener);
      }
      // Check for listener leak
      if (!existing.warned) {
        m = this.maxListeners;
        if (m && m > 0 && existing.length > m) {
          existing.warned = true;
          console.error('warning: possible EventEmitter memory ' +
                        'leak detected. %d %s listeners added. ' +
                        'Use emitter.setMaxListeners() to increase limit.',
                        existing.length, type);
          console.trace();
        }
      }
    }
    ++this._eventsCount;

    return promise || Promise.resolve();
  }


  once(type, listener) {
    if (arguments.length === 1) {
      // return a Promise instance when no callback is given
      const deferred = Promise.defer();

      return this.once(type, v => deferred.resolve(v)).then(() => deferred.promise);
    } else {
      if (typeof listener !== 'function') {
        throw new TypeError('listener must be a function');
      }

      const emitter = this;
      let fired = false;

      function g() {
        if (!fired) {
          let args = arguments;

          fired = true;

          return emitter.removeListener(type, g).then(function () {
            return listener.apply(emitter, args);
          });
        }
      };

      g.listener = listener;

      return this.on(type, g);
    }
  }

  removeListener(type, listener) {
    let list, events, position;
    let promise;

    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }

    events = this._events;
    list = events && events[type];

    if (!list) {
      return Promise.resolve();
    }

    if (list === listener || (list.listener && list.listener === listener)) {
      if (--this._eventsCount === 0) {
        this._events = {};
      } else {
        delete events[type];

        if (events.removeListener) {
          promise = this.emit('removeListener', type, listener);
        }
      }
    } else if (typeof list !== 'function') {
      position = -1;

      for (let i = list.length; i-- > 0;) {
        if (list[i] === listener ||
            (list[i].listener && list[i].listener === listener)) {
          position = i;
          break;
        }
      }

      if (position < 0) {
        return Promise.resolve();
      }

      if (list.length === 1) {
        list[0] = undefined;

        if (this._eventsCount === 1) {
          this._events = {};
          this._eventsCount = 0;

          return Promise.resolve();
        } else {
          delete events[type];
        }
      } else {
        list.splice(position, 1);

        if (list.length === 1) {
          events[type] = list[0];
        }
      }
      --this._eventsCount;

      if (events.removeListener) {
        promise = this.emit('removeListener', type, listener);
      }
    }

    return promise || Promise.resolve();
  }


  removeAllListeners(type) {
    let listeners, events;
    let promise;

    events = this._events;

    if (!events) {
      return Promise.resolve();
    }

    // not listening for removeListener, no need to emit
    if (!events.removeListener) {
      if (arguments.length === 0) {
        this._eventsCount = 0;
        this._events = {};
      } else if (events[type]) {
        if (this._eventsCount === 1) {
          this._eventsCount = 0;
          this._events = {};
        } else {
          this._eventsCount = this._eventsCount - (typeof events[type] === 'function' ? 1 : events[type].length);
          delete events[type];
        }
      }

      return Promise.resolve();
    }

    // emit removeListener for all listeners on all events
    if (arguments.length === 0) {
      let keys = Object.keys(events);

      for (let i = 0, key; i < keys.length; ++i) {
        key = keys[i];
        if (key === 'removeListener') continue;

        promise = promise && promise.then(this.removeAllListeners(key)) || this.removeAllListeners(key);
      }

      promise = promise && promise.then(this.removeAllListeners('removeListener')) || this.removeAllListeners('removeListener');
      this._events = {};
      this._eventsCount = 0;

      return promise || Promise.resolve();
    }

    listeners = events[type];

    if (typeof listeners === 'function') {
      promise = this.removeListener(type, listeners);
    } else if (listeners) {
      // LIFO order
      for (let i = listeners.length - 1; i >= 0; --i) {
        promise = promise && promise.then(this.removeListener(type, listeners[i])) || this.removeListener(type, listeners[i]);
      }
    }

    return promise || Promise.resolve();
  }

}


EventEmitter.EventEmitter = EventEmitter;

Object.defineProperties(EventEmitter, {
  defaultMaxListeners: {
    get: function getDefaultMaxListeners() {
      return events.EventEmitter.defaultMaxListeners;
    },
    set: function setDefaultMaxListeners(n) {
      events.EventEmitter.defaultMaxListeners = n;
    }
  },
  usingDomains: {
    get: function getUsingDomains() {
      return events.EventEmitter.usingDomains;
    },
    set: function setUsingDomains(b) {
      events.EventEmitter.usingDomains = b;
    }
  }
});

EventEmitter.defaultResultFilter = undefined;
EventEmitter.prototype.on = EventEmitter.prototype.addListener;
EventEmitter.prototype._resultFilter = undefined;
