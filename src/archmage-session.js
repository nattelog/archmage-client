import { ArchmageSocket } from './archmage-socket';
import { fromJS } from 'immutable';
import Promise from 'bluebird';
import crypto from 'crypto';

// const defaults = {
//   confAPIName: 'xiconf',
//   readUserSignal: 'readUsers',
//   confUpdateSignal: 'confUpdate',
// };

export default class ArchmageSession {

  // ------ SETUP ------ //

  constructor(url, protocols, options = {}) {
    this.authenticated = false;
    this.hasBeenConnected = false;
    this.authObj = undefined;
    this.user = undefined;
    if (url) {
      this.connect(url, protocols, options);
    } else {
      this.setOptions(options);
    }
    this.socket = new ArchmageSocket(url, protocols, options);
    this.socket.ws.onOpen(::this.onOpen);
    this.socket.ws.onClose(::this.onClose);
  }

  connect() {
    // this.setOptions(options);
    this.socket.connect();
  }

  setOptions(options) {
    this.reloginCallback = options.reloginCallback || this.reloginCallback;
    this.reloginFailCallback = options.reloginFailCallback || this.reloginFailCallback;
    this.userObjUpdateCallback = options.userObjUpdateCallback || this.userObjUpdateCallback;
    this.confAPIName = options.confAPIName || this.confAPIName;
    this.readUserSignal = options.readUserSignal || this.readUserSignal;
    this.confUpdateSignal = options.confUpdateSignal || this.confUpdateSignal;
  }

  // ------ INTERFACE IMPLEMENTATION ------ //

  isOpen() {
    if (this.socket) {
      return this.socket.isOpen() && this.authenticated;
    }
    return false;
  }

  auth(userId, password, tenant, target, signal, source, payloadExtra) {
    const passwordHash = this.hashify(password);
    const reqInitObj = fromJS({
      userId, passwordHash, tenant, target, signal, source, payloadExtra,
    });
    return this.socket.init(userId, passwordHash, tenant, target, signal, source, payloadExtra)
      .then(msgObj => {
        if (!this.handleInitReply(msgObj, reqInitObj)) {
          const rid = msgObj.get('payload') && msgObj.get('payload').get(0);
          const reason = `${msgObj.get('signal')}: ${rid}`;
          Promise.reject(reason);
        }
        return msgObj;
      });
  }

  logout() {
    this.user = undefined;
    this.authenticated = false;
    this.authObj = undefined;
    const tempResult = this.socket.kill(true);
    this.socket = undefined;
    return tempResult;
  }

  // BELOW NEEDS CONVERSION IF ACTIVATED!
  // login(userId, password, tenant, pid, signal, source, payloadExtra) {
  //   const passwordHash = this.hashify(password);
  //   const defer = getDefer();
  //
  //   this.socket.init(userId, passwordHash, tenant, pid, signal, source, payloadExtra)
  //     .then(initSuccess.bind(this));
  //
  //   return defer.promise;
  //
  //   // //////
  //
  //   function initSuccess(msgObj) {
  //     if (this.handleInitReply(msgObj, userId, passwordHash)) {
  //       if (this.authObj.rid) {
  //         this.readUser(this.authObj.rid)
  //           .then(defer.resolve, defer.reject);
  //       } else {
  //         defer.reject('No rid for user object: '+this.authObj.rid);
  //       }
  //     } else {
  //       defer.reject(msgObj.signal+': '+(msgObj.payload ? msgObj.payload[0]+'' : 'undefined'));
  //     }
  //   }
  // }
  // readUser(rid, pid, signal) {
  //   const defer = getDefer();
  //
  //   pid = pid || this.confAPIName || defaults.confAPIName;
  //   signal = signal || this.readUserSignal || defaults.readUserSignal;
  //   this.socket.req(pid, signal, {rids:[rid]})
  //     .then(reqSuccess.bind(this), defer.reject);
  //
  //   return defer.promise;
  //
  //   // //////
  //
  //   function subSuccess(msgObj) {
  //     if (msgObj.ok) {
  //       defer.resolve(this);  // this is set to msgObj on previous call
  //     } else {
  //       defer.reject(
  //       'sub.'+msgObj.signal+': '+(msgObj.payload ? msgObj.payload[0]+'' : 'undefined')
  //       );
  //     }
  //   }
  //
  //   function reqSuccess(msgObj) {
  //     if (msgObj.ok && msgObj.payload) {
  //       this.user = msgObj.payload[0];
  //       const signal = this.confUpdateSignal || defaults.confUpdateSignal;
  //       this.socket.sub(this.userObjUpdate, signal, [rid])
  //         .then(subSuccess.bind(msgObj), defer.reject);
  //     } else {
  //       defer.reject(
  //       'req.'+msgObj.signal+': '+(msgObj.payload ? msgObj.payload[0]+'' : 'undefined')
  //       );
  //     }
  //   }
  // }

  // ------ PRIVATE METHODS ------ //

  hashify(phrase) {
    return crypto.createHash('sha256').update(phrase).digest('hex');
  }

  handleInitReply(msgObj, reqInitObj) {
    console.log('Login reply: ', msgObj.toJS());
    this.authenticated = msgObj.get('ok');

    if (this.authenticated) {
      this.authObj = reqInitObj.set('rid', undefined);
      if (msgObj.get('payload') && msgObj.get('payload').get(0)) {
        this.authObj = reqInitObj.set('rid', msgObj.get('payload').get(0));
      }
    }
    return this.authenticated;
  }

  // BELOW NEEDS CONVERSION!
  // userObjUpdate(msgObj) {
  //   if (msgObj.payload && _.isObject(msgObj.payload[0])) {
  //     this.user = msgObj.payload[0];
  //     if (_.isFunction(this.userObjUpdateCallback)) this.userObjUpdateCallback(msgObj);
  //   }
  // }

  onOpen() {
    if (this.hasBeenConnected && this.authObj) {  // Need to relogin?
      this.socket.init(
        this.authObj.get('userId'),
        this.authObj.get('passwordHash'),
        this.authObj.get('tenant'),
        this.authObj.get('target'),
        this.authObj.get('signal'),
        this.authObj.get('source'),
        this.authObj.get('payloadExtra'),
      )
        .then(msgObj => {
          this.authenticated = msgObj.get('ok');
          console.log('Re-login attempt was successful');
          if (this.reloginCallback) this.reloginCallback(msgObj);
        })
        .catch(reason => {
          console.log('Re-login attempt failed: ', reason);
          if (this.reloginFailCallback) this.reloginFailCallback(reason);
        });
    }
  }

  onClose() {
    this.hasBeenConnected = true;
    this.authenticated = false;
  }
}

// import SHA from 'sha.js';
  // var hashObj:jsSHA.jsSHA = new jsSHA(phrase, 'TEXT');
  // return hashObj.getHash('SHA-256', 'HEX');

  // const sha256 = SHA('sha256');
  // return sha256.update(phrase, 'utf8').digest('hex');
