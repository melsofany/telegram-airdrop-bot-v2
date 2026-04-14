import { EventEmitter } from 'events';
export const automationEmitter = new EventEmitter();
automationEmitter.setMaxListeners(50);
