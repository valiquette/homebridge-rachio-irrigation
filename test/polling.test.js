import assert from 'node:assert/strict';
import { test } from 'node:test';
import Polling from '../dist/polling.js';

function setupPolling(t, valveServices, config = {}) {
	t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 0 });
	const platform = { valveServices, config, log: { debug() {} } };
	const polling = new Polling(platform);
	const update = t.mock.method(polling, 'getUpdate', async () => {});
	return { polling, update };
}

test('starts an immediate refresh and a follow-up for each valve', async (t) => {
	const firstValve = { subtype: 'first-valve' };
	const secondValve = { subtype: 'second-valve' };
	const { polling, update } = setupPolling(t, [firstValve, secondValve]);

	await polling.startLiveUpdate(firstValve);
	await polling.startLiveUpdate(secondValve);
	assert.deepEqual(update.mock.calls.map(call => call.arguments[0]), [firstValve, secondValve]);

	t.mock.timers.tick(20_000);
	assert.deepEqual(update.mock.calls.map(call => call.arguments[0]), [firstValve, secondValve, firstValve, secondValve]);
});

test('suppresses repeat refreshes through 500 ms after the last request', async (t) => {
	const valve = { subtype: 'test-valve' };
	const { polling, update } = setupPolling(t, [valve]);

	await polling.startLiveUpdate(valve);
	t.mock.timers.tick(501);
	update.mock.resetCalls();
	await polling.startLiveUpdate(valve);
	assert.equal(update.mock.callCount(), 1);

	await polling.startLiveUpdate(valve);
	assert.equal(update.mock.callCount(), 1);

	t.mock.timers.tick(499);
	await polling.startLiveUpdate(valve);
	assert.equal(update.mock.callCount(), 1);

	t.mock.timers.tick(500);
	await polling.startLiveUpdate(valve);
	assert.equal(update.mock.callCount(), 1);

	t.mock.timers.tick(501);
	await polling.startLiveUpdate(valve);
	assert.equal(update.mock.callCount(), 2);
});

test('does not schedule refreshes for an unregistered valve', async (t) => {
	const { polling, update } = setupPolling(t, [{ subtype: 'registered-valve' }]);

	await polling.startLiveUpdate({ subtype: 'unregistered-valve' });
	t.mock.timers.tick(20_000);

	assert.equal(update.mock.callCount(), 0);
});

test('replaces an earlier follow-up when a new refresh is accepted', async (t) => {
	const valve = { subtype: 'test-valve' };
	const { polling, update } = setupPolling(t, [valve]);

	await polling.startLiveUpdate(valve);
	t.mock.timers.tick(501);
	await polling.startLiveUpdate(valve);
	t.mock.timers.tick(19_499);
	assert.equal(update.mock.callCount(), 2);

	t.mock.timers.tick(501);
	assert.equal(update.mock.callCount(), 3);
	t.mock.timers.tick(20_000);
	assert.equal(update.mock.callCount(), 3);
});

test('does not refresh after the live polling window has expired', async (t) => {
	const valve = { subtype: 'test-valve' };
	const config = { liveRefreshRate: 61, liveRefreshTimeout: 1 };
	const { polling, update } = setupPolling(t, [valve], config);

	await polling.startLiveUpdate(valve);
	t.mock.timers.tick(61_000);

	assert.equal(update.mock.callCount(), 1);
	assert.equal(config.liveUpdate, false);
});
