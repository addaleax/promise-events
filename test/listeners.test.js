'use strict';

describe("Test adding and removing listeners", function () {
  const Emitter = require('../emitter');


  it("should add and remove listeners", function () {
    const events = new Emitter();
    let fn = function () {};

    this.timeout(1000);

    events._eventsCount.should.equal(0);

    return events.addListener('foo', fn).then(function () {
      events._eventsCount.should.equal(1);
      events._events['foo'].should.equal(fn);

      return events.addListener('foo', fn);
    }).then(function () {
      events._eventsCount.should.equal(2);
      events._events['foo'].should.eql([fn, fn]);

      return events.removeListener('foo', function () {});  // unknown listener
    }).then(function () {
      events._eventsCount.should.equal(2);
      events._events['foo'].should.eql([fn, fn]);

      return events.removeListener('foo', fn);
    }).then(function () {
      events._eventsCount.should.equal(1);
      events._events['foo'].should.equal(fn);

      return events.removeListener('foo', fn);
    }).then(function () {
      events._eventsCount.should.equal(0);
      events._events.should.eql({});

      return events.removeListener('buz', fn);
    });
  });


  it("should not add invalid listeners", function () {
    const events = new Emitter();

    return Promise.all([undefined, null, false, true, -1, 0, 1, '', {}, [], /./].map(function (invalid) {
      try {
        events.on('foo', invalid).then(function () {
          throw new Error("Should not allow adding invalid listener : " + invalid);
        });
      } catch (e) {
        e.message.should.equal('listener must be a function');
      }

      try {
        events.once('foo', invalid).then(function () {
          throw new Error("Should not allow adding invalid once listener : " + invalid);
        });
      } catch (e) {
        e.message.should.equal('listener must be a function');
      }

    }));
  });


  it('should not recursively call `once` events (from Node test case)', function () {
    const events = new Emitter();
    let times_recurse_emitted = 0;
    let emittedExtraEvent = false;

    events.on('e', function() {
      if (emittedExtraEvent) {
        return; // avoid infinite recursion, basically imitate .once()
      }

      emittedExtraEvent = true;
      return events.emit('e').then(function () {
        times_recurse_emitted++;
      });
    });

    events.once('e', function() {
      times_recurse_emitted++;
    });

    return events.emit('e').then(function () {
      times_recurse_emitted.should.equal(2);
    });
  });


  it('should not recursively call `once` events', function () {
    const events = new Emitter();
    let removeCount = 0;
    let fooCount = 0;

    return Promise.all([
      events.once('removeListener', function () {
        ++removeCount;
        return events.emit('removeListener');  // try to call this event again
      }),
      events.once('foo', function () {
        ++fooCount;
        return events.emit('foo');  // try to call this event again
      })
    ]).then(function () {
      return events.emit('foo').then(function () {
        removeCount.should.equal(1);
        fooCount.should.equal(1);

        events._events.should.eql({});
      });
    });
  });


  it('should fire only `once` (async)', function () {
    const events = new Emitter();
    let times_hello_emited = 0;

    return events.once('hello', function(a, b) {
      times_hello_emited++;
    }).then(function () {
      return Promise.all([
        events.emit('hello', 'a', 'b'),
        events.emit('hello', 'a', 'b'),
        events.emit('hello', 'a', 'b'),
        events.emit('hello', 'a', 'b')
      ]).then(function () {
        times_hello_emited.should.equal(1);
      });
    });
  });


  it('should fire only `once` (sync)', function () {
    const events = new Emitter();
    let times_hello_emited = 0;

    events.once('hello', function(a, b) {
      times_hello_emited++;
    });

    return Promise.all([
      events.emit('hello', 'a', 'b'),
      events.emit('hello', 'a', 'b'),
      events.emit('hello', 'a', 'b'),
      events.emit('hello', 'a', 'b')
    ]).then(function () {
      times_hello_emited.should.equal(1);
    });
  });


  it('should not fire `once` if removed first (async)', function () {
    const events = new Emitter();
    const remove = function() {
      throw new Error('once->foo should not be emitted!');
    };

    return events.once('foo', remove).then(function () {
      return events.removeListener('foo', remove);
    }).then(function () {
      return events.emit('foo');
    });
  });


  it('should not fire `once` if removed first (sync)', function () {
    const events = new Emitter();
    const remove = function() {
      throw new Error('once->foo should not be emitted!');
    };

    events.once('foo', remove);
    events.removeListener('foo', remove);

    return events.emit('foo');
  });


  it("should not remove invalid listeners", function () {
    const events = new Emitter();

    return Promise.all([undefined, null, false, true, -1, 0, 1, '', {}, [], /./].map(function (invalid) {
      try {
        events.removeListener('foo', invalid).then(function () {
          throw new Error("Should not allow removing invalid listener : " + invalid);
        });
      } catch (e) {
        e.message.should.equal('listener must be a function');
      }
    }));
  });



  it("should remove all listeners", function () {
    const events = new Emitter();
    let fn = function () {};

    this.timeout(1000);

    return Promise.all([
      events.on('foo', fn),
      events.on('foo', fn),
      events.on('foo', fn),
      events.on('bar', fn),
      events.on('bar', fn),
      events.on('meh', fn),
      events.on('meh', fn),
      events.on('removeListener', fn)
    ]).then(function () {

      events._events.should.have.ownProperty('foo').and.be.instanceOf(Array).with.lengthOf(3);
      events._events.should.have.ownProperty('bar').and.deepEqual([fn, fn]);
      events._events.should.have.ownProperty('meh').and.deepEqual([fn, fn]);

      return events.removeAllListeners('foo').then(function () {

        events._events.should.not.have.ownProperty('foo');
        events._events.should.have.ownProperty('bar').and.deepEqual([fn, fn]);
        events._events.should.have.ownProperty('meh').and.deepEqual([fn, fn]);
        events._events.should.have.ownProperty('removeListener').and.equal(fn);
        events._eventsCount.should.equal(5);

        return events.removeAllListeners('missingEvent');
      }).then(function () {
        events._events.should.have.ownProperty('bar').and.deepEqual([fn, fn]);
        events._events.should.have.ownProperty('meh').and.deepEqual([fn, fn]);
        events._events.should.have.ownProperty('removeListener').and.equal(fn);
        events._eventsCount.should.equal(5);

        return events.removeAllListeners();
      }).then(function () {
        events._events.should.eql({});
        events._eventsCount.should.equal(0);

        return events.on('foo', fn);
      }).then(function () {

        events._events.should.have.ownProperty('foo').and.equal(fn);
        events._eventsCount.should.equal(1);

        return events.removeAllListeners('foo');
      }).then(function () {
        events._events.should.eql({});
        events._eventsCount.should.equal(0);

        return events.on('foo', fn).then(events.on('bar', fn)).then(events.removeAllListeners('foo'));
      }).then(function () {
        events._events.should.not.have.ownProperty('foo');
        events._events.should.have.ownProperty('bar').and.equal(fn);
        events._eventsCount.should.equal(1);

        return events.removeAllListeners('buz');
      }).then(function () {
        events._events.should.have.ownProperty('bar').and.equal(fn);
        events._eventsCount.should.equal(1);

        // hard reset
        events._events = null;
        events._eventsCount = 0;

        return events.removeAllListeners();
      }).then(function () {
        (null === events._events).should.be.true;
        events._eventsCount.should.equal(0);
      });

    });
  });


  it("should handle emitted errors", function () {
    const events = new Emitter();

    return events.on('foo', function () {
      throw new Error('Test');
    }).then(function () {

      return Promise.all([
        events.emit('foo').then(function () {
          throw new Error('Failed test');
        }, function (err) {
          err.message.should.equal('Test');
        }),
        events.emit('foo', 1).then(function () {
          throw new Error('Failed test');
        }, function (err) {
          err.message.should.equal('Test');
        }),
        events.emit('foo', 1, 2).then(function () {
          throw new Error('Failed test');
        }, function (err) {
          err.message.should.equal('Test');
        }),
        events.emit('foo', 1, 2, 3).then(function () {
          throw new Error('Failed test');
        }, function (err) {
          err.message.should.equal('Test');
        }),
        events.emit('foo', 1, 2, 3, 4).then(function () {
          throw new Error('Failed test');
        }, function (err) {
          err.message.should.equal('Test');
        })
      ]);

    });

  });


});
