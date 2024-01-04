type Activity = {
    state: string;
    details?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    largeImageKey: string;
    largeImageText: string;
    smallImageKey: string;
    smallImageText: string;
    buttons?: ActivityButton[];
    name?: string;
    application_id: string;
    type: number;
    flags: number;
};

type ActivityButton = {
    label: string;
    url: string;
}

export { Activity, ActivityButton }
