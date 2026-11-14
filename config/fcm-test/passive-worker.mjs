// Inert shell only. No imports, bindings, fetch calls, queue or scheduled handlers.
export default {
  async fetch() {
    return new Response('ROTAPARK FCM test inactive', { status: 503 });
  },
};
