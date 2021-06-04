import './setup';
import { describe, it } from 'mocha';
import * as expect from 'expect';

import { run, sleep, createTask, Task } from '../src/index';

describe('Task', () => {
  describe('children', () => {
    it('returns the tasks children', async () => {
      let task = run();
      let child1 = task.spawn();
      let child2 = task.spawn();
      expect(task.children).toEqual([child1, child2]);
    });
  });

  describe('start', () => {
    it('is idempotent', async () => {
      let task = run();
      await task.start();
      await task.start();
      await task.start();
      expect(task.state).toEqual('running');
    });
  });

  describe('halt', () => {
    it('is idempotent', async () => {
      let task = run();
      await task.halt();
      await task.halt();
      await task.halt();
      expect(task.state).toEqual('halted');
    });
  });

  describe('type', () => {
    it('returns the type of the task', async () => {
      expect(run(Promise.resolve(123)).type).toEqual('promise');
      expect(run(() => Promise.resolve(123)).type).toEqual('async function');
      expect(run(function*() { /* no op */ }).type).toEqual('generator function');
      expect(run((function*() { /* no op */ })()).type).toEqual('generator');
      expect(run().type).toEqual('suspend');
      expect(run({ perform() { /* no op */ } }).type).toEqual('resolution');
      expect(run({ *init() { /* no op */ } }).type).toEqual('resource');
    });
  });

  describe('ensure', () => {
    it('attaches a handler which runs when the task finishes normally', async () => {
      let task = run(sleep(10));

      await expect(task).resolves.toEqual(undefined);
    });

    it('attaches a handler which runs when the task finishes errors', async () => {
      let task = run(function*() {
        yield sleep(5)
        throw new Error('boom');
      });

      await expect(task).rejects.toHaveProperty('message', 'boom');
    });

    it('attaches a handler which runs when the task halts', async () => {
      let task = run();

      await task.halt();

      await expect(task).rejects.toHaveProperty('message', 'halted');
    });
  });

  describe('catchHalt', () => {
    it('catches halt errors and resolves to undefined', async () => {
      let task = run();

      await task.halt();

      await expect(task).rejects.toHaveProperty('message', 'halted');
      await expect(task.catchHalt()).resolves.toEqual(undefined);
    });
  });

  describe('event: state', () => {
    it('is triggered when a task changes state', async () => {
      let events: { to: string; from: string }[] = []
      let task = createTask(function*() { sleep(5) });

      task.on('state', (transition) => events.push(transition));
      task.start();

      await task;

      expect(events).toEqual([
        { from: 'pending', to: 'running' },
        { from: 'running', to: 'completing' },
        { from: 'completing', to: 'completed' },
      ]);
    });
  });

  describe('event: link', () => {
    it('is triggered when a child is spawned', async () => {
      let events: Task[] = []
      let task = run();

      task.on('link', (child) => events.push(child));

      let child = task.spawn();

      expect(events).toEqual([child]);
    });
  });

  describe('event: unlink', () => {
    it('is triggered when a child terminates', async () => {
      let events: Task[] = []
      let task = run();

      task.on('unlink', (child) => events.push(child));

      let child = task.spawn(function*() { yield sleep(5); return 1 });

      expect(events).toEqual([]);
      await child;
      expect(events).toEqual([child]);
    });

    it('is triggered when a child halts', async () => {
      let events: Task[] = []
      let task = run();

      task.on('unlink', (child) => events.push(child));

      let child = task.spawn(function*() { yield sleep(5); return 1 });

      expect(events).toEqual([]);
      await child.halt();
      expect(events).toEqual([child]);
    });
  });
});
