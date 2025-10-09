(function () {
  if (typeof EventTarget !== "undefined") {
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === "keydown") {
        const wrappedListener = function (this: EventTarget, event: KeyboardEvent) {
          if (event.key === "Enter") {
            const form = (event.target as HTMLElement).closest("form");
            if (form) {
              const textInputs = form.querySelectorAll("input");
              if (textInputs.length === 1) {
                event.preventDefault();
              }
            }
          }
          (listener as EventListener)?.call(this, event);
        };
        return originalAddEventListener.call(this, type, wrappedListener as EventListener, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  }
})();
