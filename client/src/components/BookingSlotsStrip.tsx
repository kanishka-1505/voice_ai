import React from 'react';
import { Calendar, Clock, Users, User, CheckCircle2, Sparkles } from 'lucide-react';

export interface BookingSlots {
  date: string | null;
  time: string | null;
  partySize: number | null;
  name: string | null;
}

interface BookingSlotsStripProps {
  slots: BookingSlots;
  isComplete: boolean;
  turnId?: number;
}

export const BookingSlotsStrip: React.FC<BookingSlotsStripProps> = ({
  slots,
  isComplete,
  turnId,
}) => {
  const filledCount = Object.values(slots).filter(Boolean).length;

  const renderSlotCard = (label: string, value: string | number | null, icon: React.ReactNode) => {
    const isFilled = value !== null && value !== undefined && value !== '';

    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: '14px',
          background: isFilled
            ? 'rgba(110, 231, 183, 0.08)'
            : 'rgba(255, 255, 255, 0.02)',
          border: isFilled
            ? '1px solid rgba(110, 231, 183, 0.3)'
            : '1px solid rgba(110, 231, 183, 0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: isFilled ? '0 4px 20px -5px rgba(52, 211, 153, 0.12)' : 'none',
        }}
      >
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: isFilled
              ? 'rgba(110, 231, 183, 0.18)'
              : 'rgba(255, 255, 255, 0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isFilled ? '#6ee7b7' : '#5e8271',
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <span
            style={{
              fontSize: '11px',
              color: isFilled ? '#a7c4b5' : '#5e8271',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              fontWeight: 600,
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: isFilled ? '#f0fdf4' : '#3d584b',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              marginTop: '1px',
            }}
          >
            {isFilled ? (typeof value === 'number' ? `${value} Guests` : value) : 'Pending...'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        border: isComplete
          ? '1px solid rgba(110, 231, 183, 0.4)'
          : '1px solid rgba(110, 231, 183, 0.12)',
        boxShadow: isComplete
          ? '0 12px 36px -8px rgba(16, 185, 129, 0.2)'
          : '0 8px 30px -10px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#6ee7b7',
              boxShadow: '0 0 10px #6ee7b7',
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#f0fdf4',
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
            }}
          >
            Reservation Details
          </span>
          {turnId && (
            <span style={{ fontSize: '11px', color: '#5e8271' }}>• Turn #{turnId}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="glass-pill"
            style={{
              fontSize: '11px',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isComplete ? 'rgba(52, 211, 153, 0.18)' : 'rgba(110, 231, 183, 0.08)',
              color: isComplete ? '#a7f3d0' : '#6ee7b7',
              border: isComplete ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(110, 231, 183, 0.2)',
            }}
          >
            {isComplete ? (
              <>
                <CheckCircle2 size={13} color="#a7f3d0" />
                Confirmed (4/4)
              </>
            ) : (
              <>
                <Sparkles size={12} color="#6ee7b7" />
                {filledCount} of 4 Confirmed
              </>
            )}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
        }}
      >
        {renderSlotCard('Date', slots.date, <Calendar size={18} />)}
        {renderSlotCard('Time', slots.time, <Clock size={18} />)}
        {renderSlotCard('Party Size', slots.partySize, <Users size={18} />)}
        {renderSlotCard('Guest Name', slots.name, <User size={18} />)}
      </div>
    </div>
  );
};
