"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

export function ClientNavbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-dark border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#5E6AD2] flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-[#EDEDEF]">Nomi</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm text-[#8A8F98]">
          <a href="#features" className="hover:text-[#EDEDEF] transition-colors duration-200 ease-out">기능</a>
          <a href="#how" className="hover:text-[#EDEDEF] transition-colors duration-200 ease-out">사용법</a>
          <a href="#pricing" className="hover:text-[#EDEDEF] transition-colors duration-200 ease-out">요금제</a>
        </div>
        
        <div className="hidden md:flex items-center">
          <a
            href="/auth/login"
            className="text-sm font-medium text-[#8A8F98] hover:text-[#EDEDEF] transition-colors duration-200 ease-out"
          >
            로그인
          </a>
        </div>

        <button 
          className="md:hidden text-[#8A8F98] hover:text-[#EDEDEF] transition-colors duration-200 ease-out"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {isOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-[#0a0a0c] border-b border-white/[0.08] p-4 flex flex-col gap-4 shadow-2xl">
          <a 
            href="#features" 
            className="text-[#8A8F98] hover:text-[#EDEDEF] transition-colors duration-200 ease-out px-2 py-1"
            onClick={() => setIsOpen(false)}
          >
            기능
          </a>
          <a 
            href="#how" 
            className="text-[#8A8F98] hover:text-[#EDEDEF] transition-colors duration-200 ease-out px-2 py-1"
            onClick={() => setIsOpen(false)}
          >
            사용법
          </a>
          <a 
            href="#pricing" 
            className="text-[#8A8F98] hover:text-[#EDEDEF] transition-colors duration-200 ease-out px-2 py-1"
            onClick={() => setIsOpen(false)}
          >
            요금제
          </a>
          <div className="h-px bg-white/[0.06] my-2" />
          <a
            href="/auth/login"
            className="text-[#EDEDEF] font-medium px-2 py-1"
            onClick={() => setIsOpen(false)}
          >
            로그인
          </a>
        </div>
      )}
    </nav>
  );
}
