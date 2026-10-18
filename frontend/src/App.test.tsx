import { render, screen } from '@testing-library/react';
import App from './App';

it('names the collection tool', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'MTG Vault' })).toBeTruthy();
});
