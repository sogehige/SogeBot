declare namespace Events {
  export type Event = {
    id: string,
    key: string,
    name: string,
    enabled: boolean,
    triggered: any,
    definitions: Events.OperationDefinitions,
  }

  export type Filter = {
    eventId: string,
    filters: string,
  }

  export type Operation = {
    key: string,
    eventId: string,
    definitions: OperationDefinitions,
  }

  type OperationDefinitions = {
    [x: string]: string | boolean
  }

  type Attributes = {
    username: string,
    [x: string]: any,
  }
}