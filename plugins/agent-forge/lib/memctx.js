/**
 * The memory context of the work in progress, carried through async calls: which purpose (initiative, workstream,
 * the super agent that asked) a run serves, and whether it must start with fresh eyes. Callers set it around the
 * work they start (a department brief, a super team run, an ask); runAgent reads it when its caller did not say.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const als = (globalThis[Symbol.for('agent-forge.memctx')] ??= new AsyncLocalStorage())

/** Run fn with { purpose, fresh, forkFrom, areas } added to the current memory context. */
export const withMemory = (ctx, fn) => als.run({ ...(als.getStore() ?? {}), ...Object.fromEntries(Object.entries(ctx ?? {}).filter(([, v]) => v !== undefined)) }, fn)
export const currentMemory = () => als.getStore() ?? {}
