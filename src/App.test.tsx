import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders marathon planner shell', async () => {
  render(<App />);
  expect(await screen.findByText(/MyRace/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /START öffnen|\d+KM öffnen|BIKE öffnen|GYM öffnen|HOME öffnen/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Woche öffnen/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Übersicht öffnen/i })).toBeInTheDocument();
});
