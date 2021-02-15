const AsyncPolling = require('async-polling');

class ByzantineEvents {
  constructor(childChain, interval) {
    this.poll = AsyncPolling(async (end) => {
      try {
        const watcherStatus = await childChain.status();
        return end(null, watcherStatus.byzantine_events);
      } catch (err) {
        return end(err);
      }
    }, interval);
  }
}

module.exports = ByzantineEvents;
