'use client';

interface PreservedFormData {
  url: string;
  formData: Record<string, any>;
  timestamp: number;
  formId?: string;
}

interface PendingRequest {
  url: string;
  method: string;
  body?: any;
  timestamp: number;
}

class FormPreservation {
  private static instance: FormPreservation;
  private readonly STORAGE_KEY = 'preserved_forms';
  private readonly REQUEST_KEY = 'pending_requests';
  private readonly EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Clean up old data on initialization
    this.cleanupExpiredData();
  }

  static getInstance(): FormPreservation {
    if (!FormPreservation.instance) {
      FormPreservation.instance = new FormPreservation();
    }
    return FormPreservation.instance;
  }

  // Save form data before redirect
  preserveFormData(formId: string, formData: Record<string, any>): void {
    if (typeof window === 'undefined') return;

    const preserved: PreservedFormData = {
      url: window.location.href,
      formData,
      timestamp: Date.now(),
      formId
    };

    const existing = this.getAllPreservedForms();
    existing.push(preserved);

    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));
      console.log('[FormPreservation] Saved form data for', formId);
    } catch (error) {
      console.error('[FormPreservation] Failed to save form data:', error);
    }
  }

  // Retrieve form data after redirect
  getPreservedFormData(formId?: string, url?: string): PreservedFormData | null {
    if (typeof window === 'undefined') return null;

    const forms = this.getAllPreservedForms();
    const currentUrl = url || window.location.href;

    // Find matching form
    const match = forms.find(form => {
      if (formId && form.formId === formId) return true;
      if (!formId && this.urlsMatch(form.url, currentUrl)) return true;
      return false;
    });

    if (match) {
      // Remove from storage after retrieval
      this.removePreservedForm(match);
      console.log('[FormPreservation] Retrieved and removed form data');
      return match;
    }

    return null;
  }

  // Save pending API request
  savePendingRequest(url: string, method: string, body?: any): void {
    if (typeof window === 'undefined') return;

    const request: PendingRequest = {
      url,
      method,
      body,
      timestamp: Date.now()
    };

    const existing = this.getAllPendingRequests();
    existing.push(request);

    try {
      sessionStorage.setItem(this.REQUEST_KEY, JSON.stringify(existing));
      console.log('[FormPreservation] Saved pending request:', url);
    } catch (error) {
      console.error('[FormPreservation] Failed to save request:', error);
    }
  }

  // Get and clear pending requests
  getPendingRequests(): PendingRequest[] {
    if (typeof window === 'undefined') return [];

    const requests = this.getAllPendingRequests();

    // Clear after retrieval
    if (requests.length > 0) {
      sessionStorage.removeItem(this.REQUEST_KEY);
      console.log('[FormPreservation] Retrieved', requests.length, 'pending requests');
    }

    return requests;
  }

  // Auto-save form data on input change
  autoSaveForm(formElement: HTMLFormElement, formId: string): () => void {
    if (typeof window === 'undefined') return () => {};

    const saveHandler = () => {
      const formData = new FormData(formElement);
      const data: Record<string, any> = {};

      formData.forEach((value, key) => {
        if (data[key]) {
          // Handle multiple values (like checkboxes)
          if (!Array.isArray(data[key])) {
            data[key] = [data[key]];
          }
          data[key].push(value);
        } else {
          data[key] = value;
        }
      });

      this.preserveFormData(formId, data);
    };

    // Debounced save
    let timeout: NodeJS.Timeout;
    const debouncedSave = () => {
      clearTimeout(timeout);
      timeout = setTimeout(saveHandler, 1000);
    };

    // Add listeners
    formElement.addEventListener('input', debouncedSave);
    formElement.addEventListener('change', debouncedSave);

    // Return cleanup function
    return () => {
      formElement.removeEventListener('input', debouncedSave);
      formElement.removeEventListener('change', debouncedSave);
      clearTimeout(timeout);
    };
  }

  // Restore form data to form element
  restoreToForm(formElement: HTMLFormElement, data: Record<string, any>): void {
    Object.entries(data).forEach(([key, value]) => {
      const elements = formElement.querySelectorAll(`[name="${key}"]`);

      elements.forEach((element) => {
        if (element instanceof HTMLInputElement) {
          if (element.type === 'checkbox' || element.type === 'radio') {
            const values = Array.isArray(value) ? value : [value];
            element.checked = values.includes(element.value);
          } else {
            element.value = value?.toString() || '';
          }
        } else if (element instanceof HTMLSelectElement) {
          element.value = value?.toString() || '';
        } else if (element instanceof HTMLTextAreaElement) {
          element.value = value?.toString() || '';
        }
      });
    });

    console.log('[FormPreservation] Restored form data');
  }

  // Clean up expired data
  private cleanupExpiredData(): void {
    if (typeof window === 'undefined') return;

    const now = Date.now();

    // Clean forms
    const forms = this.getAllPreservedForms();
    const validForms = forms.filter(form =>
      now - form.timestamp < this.EXPIRY_TIME
    );
    if (validForms.length !== forms.length) {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(validForms));
    }

    // Clean requests
    const requests = this.getAllPendingRequests();
    const validRequests = requests.filter(req =>
      now - req.timestamp < this.EXPIRY_TIME
    );
    if (validRequests.length !== requests.length) {
      sessionStorage.setItem(this.REQUEST_KEY, JSON.stringify(validRequests));
    }
  }

  private getAllPreservedForms(): PreservedFormData[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private getAllPendingRequests(): PendingRequest[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = sessionStorage.getItem(this.REQUEST_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private removePreservedForm(form: PreservedFormData): void {
    const forms = this.getAllPreservedForms();
    const filtered = forms.filter(f =>
      f.timestamp !== form.timestamp || f.formId !== form.formId
    );
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }

  private urlsMatch(url1: string, url2: string): boolean {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);

      // Compare pathname and relevant search params
      return parsed1.pathname === parsed2.pathname;
    } catch {
      return false;
    }
  }

  // Clear all preserved data
  clearAll(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.REQUEST_KEY);
  }
}

export default FormPreservation;