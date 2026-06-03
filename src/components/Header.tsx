
import React from 'react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  status: ConnectionStatus;
}

export const Header: React.FC<HeaderProps> = ({ status }) => {
  const getStatusDisplay = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return (
          <div className="flex items-center gap-2 text-indigo-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            <span className="font-black text-[9px] uppercase tracking-[0.3em]">Uplink Active</span>
          </div>
        );
      case ConnectionStatus.CONNECTING:
        return (
          <div className="flex items-center gap-2 text-amber-500">
             <div className="w-3 h-3 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
             <span className="font-black text-[9px] uppercase tracking-[0.3em]">Linking...</span>
          </div>
        );
      case ConnectionStatus.ERROR:
        return (
          <div className="flex items-center gap-2 text-rose-500">
             <span className="font-black text-[9px] uppercase tracking-[0.3em]">Offline</span>
          </div>
        );
      default:
        return <span className="text-slate-500 font-black text-[9px] uppercase tracking-[0.3em]">Ready</span>;
    }
  };

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-black text-white uppercase tracking-tighter">
          Nexus Justice <span className="text-indigo-500">v3.1</span>
        </h1>
      </div>
      <div className="h-6 w-px bg-white/10" />
      <div className="px-4 py-1.5 bg-white/5 border border-white/5 rounded-full">
        {getStatusDisplay()}
      </div>
    </div>
  );
};
