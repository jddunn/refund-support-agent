import { describe, expect, it } from 'vitest';
import { toAgentHistory } from './history';

describe('toAgentHistory', () => {
  it('converts customer and agent chat turns to LangChain messages', () => {
    const messages = toAgentHistory([
      { role: 'customer', text: 'I need a refund for ORD-58120.' },
      { role: 'agent', text: 'I can help with that order.' },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.getType()).toBe('human');
    expect(messages[0]?.content).toBe('I need a refund for ORD-58120.');
    expect(messages[1]?.getType()).toBe('ai');
    expect(messages[1]?.content).toBe('I can help with that order.');
  });

  it('drops empty turns before building model history', () => {
    const messages = toAgentHistory([
      { role: 'customer', text: '   ' },
      { role: 'agent', text: 'Please share the order id.' },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.getType()).toBe('ai');
    expect(messages[0]?.content).toBe('Please share the order id.');
  });
});
