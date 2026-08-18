import React from 'react';
import { ValidationReport } from '../types';

interface ValidationPanelProps {
  report: ValidationReport | null;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ report }) => {
  if (!report) return null;

  return (
    <section className={`validation-panel ${report.is_valid ? 'valid' : 'invalid'}`}>
      <div className="validation-header">
        <h2>{report.is_valid ? 'Scenario Ready' : 'Scenario Needs Fixes'}</h2>
        <span className={`validation-status ${report.is_valid ? 'valid' : 'invalid'}`}>
          {report.errors.length} errors / {report.warnings.length} warnings
        </span>
      </div>

      <div className="validation-summary">
        <span>Locations: {report.summary.locations}</span>
        <span>Depots: {report.summary.depots}</span>
        <span>Orders: {report.summary.orders}</span>
        <span>Vehicles: {report.summary.vehicles}</span>
        <span>Demand: {report.summary.total_demand.toFixed(0)}</span>
        <span>Capacity: {report.summary.total_capacity.toFixed(0)}</span>
      </div>

      {report.errors.length > 0 && (
        <div className="validation-list">
          <strong>Errors</strong>
          <ul>
            {report.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="validation-list">
          <strong>Warnings</strong>
          <ul>
            {report.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
};
