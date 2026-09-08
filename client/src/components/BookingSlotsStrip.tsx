import React from 'react';
import { Calendar, Clock, Users, User, CheckCircle2 } from 'lucide-react';

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
    const isFilled = value !== null && value !== undefined;

    return (
      <div style={{
        flex: 1,
        minWidth: '150px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: isFilled ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        border: isFilled ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'all 0.3s ease'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: isFilled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isFilled ? '#38bdf8' : '#64748b'
        }}>
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
          </span>
          <span style={{
            fontSize: '14px',
            fontWeight: 700,
            color: isFilled ? '#f8fafc' : '#475569'
          }}>
            {isFilled ? (typeof value === 'number' ? `${value} Guests` : value) : '—'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.7)',
      border: isComplete ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: isComplete ? '0 0 20px rgba(16, 185, 129, 0.15)' : 'none',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px' }}>
            BOOKING STATE (SESSION-SCOPED)
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>
            Persists across turns & interruptions {turnId ? `• Turn #${turnId}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '11px',
            padding: '3px 10px',
            borderRadius: '999px',
            background: isComplete ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.12)',
            color: isComplete ? '#34d399' : '#38bdf8',
            border: '1px solid currentColor',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {isComplete ? <CheckCircle2 size={12} /> : null}
            {isComplete ? 'RESERVATION COMPLETE (4/4)' : `IN PROGRESS (${filledCount}/4 SLOTS)`}
          </span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '10px'
      }}>
        {renderSlotCard('Date', slots.date, <Calendar size={16} />)}
        {renderSlotCard('Time', slots.time, <Clock size={16} />)}
        {renderSlotCard('Party Size', slots.partySize, <Users size={16} />)}
        {renderSlotCard('Name', slots.name, <User size={16} />)}
      </div>
    </div>
  );
};
