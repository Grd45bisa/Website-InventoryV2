import React from 'react';
import './ProductSkeleton.css';

export default function ProductSkeleton({ viewMode = 'table' }) {
  const items = Array.from({ length: 8 });

  if (viewMode === 'card') {
    return (
      <div className="product-skeleton__card-grid">
        {items.map((_, index) => (
          <div className="product-skeleton__card" key={index}>
            <div className="product-skeleton__image product-skeleton__pulse" />
            <div className="product-skeleton__body">
              <div className="product-skeleton__line product-skeleton__pulse" />
              <div className="product-skeleton__line product-skeleton__line--short product-skeleton__pulse" />
              <div className="product-skeleton__boxes">
                <div className="product-skeleton__box product-skeleton__pulse" />
                <div className="product-skeleton__box product-skeleton__pulse" />
              </div>
              <div className="product-skeleton__price product-skeleton__pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Table skeleton loader
  return (
    <div className="product-skeleton__table-container">
      <table className="product-skeleton__table">
        <thead>
          <tr>
            <th style={{ width: '56px' }}>
              <div className="product-skeleton__th-inner product-skeleton__pulse" />
            </th>
            <th>
              <div className="product-skeleton__th-inner product-skeleton__pulse" style={{ width: '120px' }} />
            </th>
            <th style={{ width: '120px' }}>
              <div className="product-skeleton__th-inner product-skeleton__pulse" />
            </th>
            <th style={{ width: '140px' }}>
              <div className="product-skeleton__th-inner product-skeleton__pulse" />
            </th>
            <th style={{ width: '120px' }}>
              <div className="product-skeleton__th-inner product-skeleton__pulse" />
            </th>
            <th style={{ width: '80px' }}>
              <div className="product-skeleton__th-inner product-skeleton__pulse" />
            </th>
            <th style={{ width: '100px' }}>
              <div className="product-skeleton__th-inner product-skeleton__pulse" />
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((_, rowIndex) => (
            <tr key={rowIndex}>
              <td>
                <div className="product-skeleton__td-avatar product-skeleton__pulse" />
              </td>
              <td>
                <div className="product-skeleton__td-line product-skeleton__pulse" style={{ width: '70%' }} />
              </td>
              <td>
                <div className="product-skeleton__td-line product-skeleton__pulse" style={{ width: '50%' }} />
              </td>
              <td>
                <div className="product-skeleton__td-line product-skeleton__pulse" style={{ width: '60%' }} />
              </td>
              <td>
                <div className="product-skeleton__td-line product-skeleton__pulse" style={{ width: '40%' }} />
              </td>
              <td>
                <div className="product-skeleton__td-line product-skeleton__pulse" style={{ width: '30%' }} />
              </td>
              <td>
                <div className="product-skeleton__td-badge product-skeleton__pulse" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
