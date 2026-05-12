'use client';

import * as Toast from '@radix-ui/react-toast';
import { useState } from 'react';

export function Toaster() {
  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Viewport className="fixed bottom-0 right-0 z-50 m-0 flex w-96 max-w-[100vw] list-none flex-col gap-2 p-6 outline-none" />
    </Toast.Provider>
  );
}
