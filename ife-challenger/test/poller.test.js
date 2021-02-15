const chai = require('chai');
const sinon = require('sinon');
const Poller = require('../src/byzantine-events');

const { assert } = chai;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const POLL_INTERVAL = 100;

const mockChildChain = {
  status: () => ({ byzantine_events: [] }),
};

describe('Poller tests', () => {
  beforeEach(() => {
    this.poller = new Poller(mockChildChain, POLL_INTERVAL);
  });

  afterEach(() => {
    this.poller.poll.stop();
    sinon.restore();
  });

  it('should callback with []', async () => {
    const callback = sinon.spy();
    this.poller.poll.on('result', callback);

    this.poller.poll.run();
    await sleep(POLL_INTERVAL);
    assert.isTrue(callback.called);
    assert.isTrue(callback.calledWith([]));
  });

  it('should callback with byzantine events', async () => {
    const statusResult = {
      byzantine_events: [
        { event: 'invalid_piggyback' },
      ],
    };
    sinon.stub(mockChildChain, 'status').callsFake(() => (statusResult));

    const callback = sinon.spy();
    this.poller.poll.on('result', callback);

    this.poller.poll.run();
    await sleep(POLL_INTERVAL);
    assert.isTrue(callback.called);
    assert.isTrue(callback.calledWith(statusResult.byzantine_events));
  });
});
