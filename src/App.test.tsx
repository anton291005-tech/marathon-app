import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders marathon planner shell', async () => {
  render(<App />);
  expect(await screen.findByText(/Trainingsverlauf/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Home öffnen/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Woche öffnen/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Übersicht öffnen/i })).toBeInTheDocument();
});
