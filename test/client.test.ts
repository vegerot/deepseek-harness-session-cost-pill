import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

describe('client.js bundle registration', () => {
  it('registers factory into window.__ModuleLoader__ and attaches to conversation.composer.dock', async () => {
    let loadedConfig: any = null;
    const mockWindow: any = {
      __ModuleLoader__: {
        load(config: any) {
          loadedConfig = config;
        },
      },
    };

    // Provide window global for script execution
    (globalThis as any).window = mockWindow;

    // Import client.js (it runs synchronously and calls window.__ModuleLoader__.load)
    await import('../client.js');

    assert.notEqual(loadedConfig, null);
    assert.equal(loadedConfig.id, '@local/session-cost-pill');
    assert.equal(typeof loadedConfig.factory, 'function');

    const fakeRequire = (name: string) => {
      if (name === 'react') return React;
      throw new Error(`Unexpected require: ${name}`);
    };

    const plugin = loadedConfig.factory(fakeRequire);
    assert.deepEqual(plugin.inject, ['slots']);
    assert.equal(typeof plugin.apply, 'function');

    const registeredEntries: any[] = [];
    const fakeCtx = {
      slots: {
        inject(slotName: string, thunk: () => void) {
          assert.equal(slotName, 'conversation.composer.dock');
          thunk();
        },
        register(opts: any, component: any) {
          registeredEntries.push({ opts, component });
        },
      },
    };

    plugin.apply(fakeCtx);
    assert.equal(registeredEntries.length, 1);
    assert.equal(registeredEntries[0].opts.name, 'conversation.composer.dock');
    assert.equal(registeredEntries[0].opts.id, 'cost-pill');
    assert.equal(registeredEntries[0].opts.order, 2);
    assert.equal(typeof registeredEntries[0].component, 'function');
  });
});
