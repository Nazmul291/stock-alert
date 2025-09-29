'use client';

import { useEffect, useRef, useCallback } from 'react';
import FormPreservation from '@/lib/form-preservation';

interface UseFormPreservationOptions {
  formId: string;
  autoSave?: boolean;
  restoreOnMount?: boolean;
}

export function useFormPreservation(options: UseFormPreservationOptions) {
  const { formId, autoSave = true, restoreOnMount = true } = options;
  const formRef = useRef<HTMLFormElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const preservation = FormPreservation.getInstance();

  // Save form data manually
  const saveForm = useCallback((data?: Record<string, any>) => {
    if (data) {
      preservation.preserveFormData(formId, data);
    } else if (formRef.current) {
      const formData = new FormData(formRef.current);
      const formObject: Record<string, any> = {};

      formData.forEach((value, key) => {
        if (formObject[key]) {
          if (!Array.isArray(formObject[key])) {
            formObject[key] = [formObject[key]];
          }
          formObject[key].push(value);
        } else {
          formObject[key] = value;
        }
      });

      preservation.preserveFormData(formId, formObject);
    }
  }, [formId, preservation]);

  // Restore form data
  const restoreForm = useCallback(() => {
    if (!formRef.current) return false;

    const preserved = preservation.getPreservedFormData(formId);
    if (preserved) {
      preservation.restoreToForm(formRef.current, preserved.formData);
      return true;
    }
    return false;
  }, [formId, preservation]);

  // Clear preserved data
  const clearPreserved = useCallback(() => {
    const preserved = preservation.getPreservedFormData(formId);
    if (preserved) {
      // This removes it from storage
    }
  }, [formId, preservation]);

  // Set up auto-save
  useEffect(() => {
    if (autoSave && formRef.current) {
      cleanupRef.current = preservation.autoSaveForm(formRef.current, formId);
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [autoSave, formId, preservation]);

  // Restore on mount if enabled
  useEffect(() => {
    if (restoreOnMount && formRef.current) {
      const restored = restoreForm();
      if (restored) {
      }
    }
  }, [restoreOnMount, restoreForm, formId]);

  return {
    formRef,
    saveForm,
    restoreForm,
    clearPreserved,
  };
}

// Example usage in a component:
/*
export function MyForm() {
  const { formRef, saveForm, clearPreserved } = useFormPreservation({
    formId: 'settings-form',
    autoSave: true,
    restoreOnMount: true
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Save before API call in case of auth redirect
    saveForm();

    try {
      const response = await authenticatedFetch('/api/save-settings', {
        method: 'POST',
        body: new FormData(formRef.current!)
      });

      if (response.ok) {
        clearPreserved(); // Clear on success
      }
    } catch (error) {
      // Form data is preserved if we get redirected
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <input name="setting1" type="text" />
      <button type="submit">Save</button>
    </form>
  );
}
*/