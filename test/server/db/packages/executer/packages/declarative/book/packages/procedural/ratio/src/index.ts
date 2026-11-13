interface Event {
        kind: string
        dirty: number
}

// open と、変化のある save の比の領域。save が続く利用、open が続く利用、交互
export const RATIOS = ['ratio/save', 'ratio/open', 'ratio/mixed']

export const ratio = (events: Event[]) => {
        const opens = events.filter((event) => event.kind === 'open').length
        const saves = events.filter((event) => event.kind === 'save' && event.dirty > 0).length
        if (saves >= 2 * opens) return RATIOS[0]
        return opens >= 2 * saves ? RATIOS[1] : RATIOS[2]
}
