import { Module } from '../modules/Module';
import { Context } from './Context';

/**
 * Utility function for creating decorators that apply inhibitors to module commands.
 * @param inhibitors
 */
export const createInhibitingDecorator = (
	...inhibitors: CommandInhibitor[]
) => (
	module: new () => Module,
	name: string,
	descriptor: TypedPropertyDescriptor<ModuleCommandHandler>
) => {
	if (descriptor.value instanceof Command) {
		return descriptor.value.useInhibitor(...inhibitors);
	}
	throw Error(
		'Command-inhibiting decorators may only be used on @command decorated functions.'
	);
};

const dmOnlyInhibitor = (ctx: Context) => ctx.isDM;
const guildOnlyInhibitor = (ctx: Context) => (ctx.guild ? true : false);

export type CommandHandler = (ctx: Context) => Promise<void>;
export type ModuleCommandHandler = (ctx: Context) => Promise<void>;

/**
 * A command inhibitor is a function that can be added to a command to affect
 * when and where it can be called.
 *
 * Inhibitors that return false, or a non-truthy value will prevent command execution.
 * Additionally, throwing errors inside an inhibitor will also have the same effect.
 */
type CommandInhibitor = (ctx: Context) => Promise<boolean> | boolean;

export interface CommandOptions {
	disabled: boolean;
	inhibitors: CommandInhibitor[];
	aliases: string[];
	module?: Module;
}

const DEFAULT_COMMAND_OPTIONS: CommandOptions = {
	disabled: false,
	aliases: [],
	inhibitors: [],
};

/**
 * A class representing a user-runnable command.
 */
export class Command {
	readonly options: CommandOptions = DEFAULT_COMMAND_OPTIONS;
	readonly inhibitors: CommandInhibitor[] = [];

	constructor(
		readonly name: string,
		readonly handler: CommandHandler | ModuleCommandHandler,
		opts: Partial<CommandOptions> = DEFAULT_COMMAND_OPTIONS
	) {
		this.options = { ...DEFAULT_COMMAND_OPTIONS, ...opts };
	}

	/**
	 * Run the command in the given context.
	 */
	async execute(ctx: Context) {
		if (await this.callInhibitors(ctx)) {
			return;
		}

		return this.options.module
			? this.handler.apply(this.options.module, [ctx])
			: this.handler(ctx);
	}

	/**
	 * Call the inhibitors attached to the command.
	 * @param ctx
	 */
	protected async callInhibitors(ctx: Context): Promise<boolean> {
		let isInhibited = false;

		for (const inhibitor of this.inhibitors) {
			try {
				isInhibited = !(await (this.options.module
					? inhibitor.apply(this.options.module, [ctx])
					: inhibitor(ctx)));
			} catch (err) {
				ctx.client.logger.warn(
					'Error in inhibitor',
					inhibitor.name,
					'- preventing command execution.'
				);
				isInhibited = false;
			}

			if (isInhibited) {
				return isInhibited;
			}
		}
		return isInhibited;
	}

	/**
	 * Dynamically disable a command.
	 */
	disable() {
		return (this.options.disabled = true);
	}

	/**
	 * Dynamically enable a command.
	 */
	enable() {
		return (this.options.disabled = false);
	}

	/**
	 * Add inhibitors to the command.
	 * @param inhibitors
	 */
	useInhibitor(...inhibitors: CommandInhibitor[]) {
		this.inhibitors.push(...inhibitors);
		return this;
	}

	/**
	 * Inhibit a command such that it can only run in a direct message channel.
	 * @param module
	 * @param name
	 * @param descriptor
	 */
	static dmOnly = createInhibitingDecorator(dmOnlyInhibitor);

	/**
	 * Inhibit a command such that it can only run in a guild.
	 */
	static guildOnly = createInhibitingDecorator(guildOnlyInhibitor);
}

export const dmOnly = Command.dmOnly;
export const guildOnly = Command.guildOnly;
