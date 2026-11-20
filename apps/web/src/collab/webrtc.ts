// Fachada da API pública do WebRTC P2P (implementação dividida em webrtc*.ts).
export { DEFAULT_ICE_SERVERS, type RtcFactory, type RtcGuest, type RtcHost } from './webrtcTipos.ts';
export { isRtcAnswerCode, isRtcOfferCode } from './webrtcCodigos.ts';
export { createRtcHost } from './webrtcHost.ts';
export { createRtcGuest } from './webrtcGuest.ts';
