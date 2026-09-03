import EventEmitter from 'events';

class GatewayEventEmitter extends EventEmitter {}

export const gatewayEvents = new GatewayEventEmitter();
