// Basic debounce function to reduce function calls
export function debounce<TArgs extends unknown[]>(
    func: (...args: TArgs) => void,
    wait: number
): (...args: TArgs) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return function play(...args: TArgs) {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}
