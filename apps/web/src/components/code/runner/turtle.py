"""Turtle graphics for lessons: the familiar turtle commands, recorded as a
drawing the lesson plays back on a canvas, since a browser has no Tk.

Coordinates are the turtle's own: the centre is (0, 0), y grows upwards and
a heading of 0 points east, turning anticlockwise as in standard mode.
"""

import math

__all__ = [
    "Turtle", "Pen", "RawTurtle", "Screen", "Vec2D", "Terminator",
    "forward", "fd", "back", "backward", "bk", "right", "rt", "left", "lt",
    "goto", "setpos", "setposition", "teleport", "setx", "sety",
    "setheading", "seth", "home", "circle", "dot", "stamp", "speed",
    "position", "pos", "xcor", "ycor", "heading", "towards", "distance",
    "pendown", "pd", "down", "penup", "pu", "up", "pensize", "width",
    "pencolor", "fillcolor", "color", "isdown", "begin_fill", "end_fill",
    "filling", "showturtle", "st", "hideturtle", "ht", "isvisible", "shape",
    "write", "clear", "reset", "bgcolor", "title", "setup", "screensize",
    "tracer", "update", "delay", "colormode", "mode", "degrees", "radians",
    "done", "mainloop", "exitonclick", "bye", "getscreen", "getturtle",
    "textinput", "numinput",
]

Vec2D = tuple


class Terminator(Exception):
    pass


_COMMANDS = []
_SCREEN = {"width": 400, "height": 400, "bg": "white", "title": ""}
_MAX_COMMANDS = 50_000
_colormode = [1.0]


def _record(command):
    if len(_COMMANDS) >= _MAX_COMMANDS:
        raise Terminator("The drawing has more steps than can be shown.")
    _COMMANDS.append(command)
    return len(_COMMANDS) - 1


def _colour(value):
    if isinstance(value, str):
        return value
    if isinstance(value, (tuple, list)) and len(value) == 3:
        scale = 255 / _colormode[0]
        r, g, b = (max(0, min(255, round(part * scale))) for part in value)
        return f"#{r:02x}{g:02x}{b:02x}"
    raise TypeError(f"bad colour: {value!r}")


def _colour_args(args):
    if len(args) == 3:
        return _colour(tuple(args))
    return _colour(args[0])


class Turtle:
    _all = []

    def __init__(self, shape="classic", visible=True):
        self._x = 0.0
        self._y = 0.0
        self._heading = 0.0
        self._down = True
        self._width = 1
        self._pen = "black"
        self._fill = "black"
        self._visible = visible
        self._shape = shape
        self._speed = 3
        self._filling = None
        self._full_circle = 360.0
        self._id = len(Turtle._all)
        Turtle._all.append(self)
        self._state()

    def _state(self):
        _record({
            "op": "turtle", "id": self._id, "x": self._x, "y": self._y,
            "heading": self._heading, "visible": self._visible,
            "shape": self._shape, "speed": self._speed,
        })

    def _move(self, x, y, draw=True):
        if self._down and draw:
            _record({
                "op": "line", "id": self._id,
                "from": [self._x, self._y], "to": [x, y],
                "color": self._pen, "width": self._width,
                "speed": self._speed,
            })
        else:
            _record({"op": "move", "id": self._id, "to": [x, y], "speed": self._speed})
        self._x, self._y = float(x), float(y)
        if self._filling is not None:
            self._filling.append([self._x, self._y])

    def _turn(self, angle):
        self._heading = (self._heading + angle * 360.0 / self._full_circle) % 360.0
        _record({"op": "turn", "id": self._id, "heading": self._heading, "speed": self._speed})

    # Moving and drawing
    def forward(self, distance):
        radians = math.radians(self._heading)
        self._move(
            self._x + distance * math.cos(radians),
            self._y + distance * math.sin(radians),
        )

    fd = forward

    def back(self, distance):
        self.forward(-distance)

    backward = bk = back

    def right(self, angle):
        self._turn(-angle)

    rt = right

    def left(self, angle):
        self._turn(angle)

    lt = left

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._move(x, y)

    setpos = setposition = goto

    def teleport(self, x=None, y=None, *, fill_gap=False):
        self._move(self._x if x is None else x, self._y if y is None else y, draw=False)

    def setx(self, x):
        self._move(x, self._y)

    def sety(self, y):
        self._move(self._x, y)

    def setheading(self, to_angle):
        self._heading = (to_angle * 360.0 / self._full_circle) % 360.0
        _record({"op": "turn", "id": self._id, "heading": self._heading, "speed": self._speed})

    seth = setheading

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def circle(self, radius, extent=None, steps=None):
        extent = self._full_circle if extent is None else extent
        degrees = extent * 360.0 / self._full_circle
        if steps is None:
            frac = abs(degrees) / 360.0
            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        step_angle = degrees / steps
        length = 2.0 * radius * math.sin(math.radians(step_angle) / 2.0)
        if radius < 0:
            length, step_angle = -length, -step_angle
        self._turn_quiet(step_angle / 2.0)
        for _ in range(steps):
            self.forward(length)
            self._turn_quiet(step_angle)
        self._turn_quiet(-step_angle / 2.0)
        _record({"op": "turn", "id": self._id, "heading": self._heading, "speed": self._speed})

    def _turn_quiet(self, degrees):
        self._heading = (self._heading + degrees) % 360.0

    def dot(self, size=None, *color):
        diameter = max(self._width + 4, self._width * 2) if size is None else size
        _record({
            "op": "dot", "at": [self._x, self._y], "size": diameter,
            "color": _colour_args(color) if color else self._pen,
        })

    def stamp(self):
        _record({
            "op": "stamp", "at": [self._x, self._y], "heading": self._heading,
            "color": self._fill, "outline": self._pen, "shape": self._shape,
        })
        return len(_COMMANDS)

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        _record({
            "op": "text", "at": [self._x, self._y], "text": str(arg),
            "align": align, "font": list(font), "color": self._pen,
        })

    def speed(self, speed=None):
        if speed is None:
            return self._speed
        names = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}
        value = names.get(speed, speed) if isinstance(speed, str) else speed
        self._speed = 0 if value > 10 or value < 0.5 else int(round(value))

    # Where the turtle is
    def position(self):
        return (self._x, self._y)

    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._heading * self._full_circle / 360.0

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        angle = math.degrees(math.atan2(y - self._y, x - self._x)) % 360.0
        return angle * self._full_circle / 360.0

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(x - self._x, y - self._y)

    def degrees(self, fullcircle=360.0):
        self._full_circle = fullcircle

    def radians(self):
        self._full_circle = 2 * math.pi

    # The pen
    def pendown(self):
        self._down = True

    pd = down = pendown

    def penup(self):
        self._down = False

    pu = up = penup

    def isdown(self):
        return self._down

    def pensize(self, width=None):
        if width is None:
            return self._width
        self._width = width

    width = pensize

    def pencolor(self, *args):
        if not args:
            return self._pen
        self._pen = _colour_args(args)

    def fillcolor(self, *args):
        if not args:
            return self._fill
        self._fill = _colour_args(args)

    def color(self, *args):
        if not args:
            return (self._pen, self._fill)
        if len(args) == 2:
            self._pen, self._fill = _colour(args[0]), _colour(args[1])
        else:
            self._pen = self._fill = _colour_args(args)

    def begin_fill(self):
        self._filling = [[self._x, self._y]]
        self._fill_at = _record({"op": "fill", "points": [], "color": self._fill})

    def end_fill(self):
        if self._filling is not None:
            _COMMANDS[self._fill_at]["points"] = self._filling
            _COMMANDS[self._fill_at]["color"] = self._fill
        self._filling = None

    def filling(self):
        return self._filling is not None

    # How the turtle looks
    def showturtle(self):
        self._visible = True
        self._state()

    st = showturtle

    def hideturtle(self):
        self._visible = False
        self._state()

    ht = hideturtle

    def isvisible(self):
        return self._visible

    def shape(self, name=None):
        if name is None:
            return self._shape
        self._shape = name
        self._state()

    def shapesize(self, *args, **kwargs):
        pass

    turtlesize = shapesize

    def clear(self):
        _record({"op": "clear", "id": self._id})

    def reset(self):
        self.clear()
        self.__init__(self._shape, True)

    def getscreen(self):
        return _screen

    def getturtle(self):
        return self

    def onclick(self, *args, **kwargs):
        pass

    onrelease = ondrag = onclick


Pen = RawTurtle = Turtle


class _Screen:
    def bgcolor(self, *args):
        if not args:
            return _SCREEN["bg"]
        _SCREEN["bg"] = _colour_args(args)
        _record({"op": "bg", "color": _SCREEN["bg"]})

    def title(self, text):
        _SCREEN["title"] = str(text)

    def setup(self, width=400, height=400, startx=None, starty=None):
        if isinstance(width, int) and isinstance(height, int):
            _SCREEN["width"], _SCREEN["height"] = width, height

    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if canvwidth and canvheight:
            self.setup(canvwidth, canvheight)
        if bg is not None:
            self.bgcolor(bg)

    def colormode(self, mode=None):
        if mode is None:
            return _colormode[0]
        _colormode[0] = 255 if mode == 255 else 1.0

    def mode(self, mode=None):
        return "standard"

    def tracer(self, n=None, delay=None):
        if n == 0:
            _record({"op": "instant"})

    def update(self):
        pass

    def delay(self, delay=None):
        return 0

    def textinput(self, title, prompt):
        return input(prompt)

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        return float(input(prompt))

    def done(self):
        pass

    mainloop = exitonclick = bye = done

    def onclick(self, *args, **kwargs):
        pass

    onkey = onkeypress = onkeyrelease = listen = ontimer = onscreenclick = onclick

    def turtles(self):
        return list(Turtle._all)


_screen = _Screen()


def Screen():
    return _screen


_pen = None


def _turtle():
    global _pen
    if _pen is None:
        _pen = Turtle()
    return _pen


def _bind(name):
    def call(*args, **kwargs):
        return getattr(_turtle(), name)(*args, **kwargs)

    call.__name__ = name
    return call


for _name in [
    "forward", "fd", "back", "backward", "bk", "right", "rt", "left", "lt",
    "goto", "setpos", "setposition", "teleport", "setx", "sety",
    "setheading", "seth", "home", "circle", "dot", "stamp", "speed",
    "position", "pos", "xcor", "ycor", "heading", "towards", "distance",
    "pendown", "pd", "down", "penup", "pu", "up", "pensize", "width",
    "pencolor", "fillcolor", "color", "isdown", "begin_fill", "end_fill",
    "filling", "showturtle", "st", "hideturtle", "ht", "isvisible", "shape",
    "write", "clear", "reset", "degrees", "radians", "shapesize",
    "turtlesize", "getturtle",
]:
    globals()[_name] = _bind(_name)

for _name in [
    "bgcolor", "title", "setup", "screensize", "tracer", "update", "delay",
    "colormode", "mode", "done", "mainloop", "exitonclick", "bye",
    "textinput", "numinput", "onkey", "onkeypress", "listen", "ontimer",
    "onscreenclick",
]:
    globals()[_name] = getattr(_screen, _name)


def getscreen():
    return _screen


def _drawing():
    """What was drawn, for the lesson to play back; nothing if no turtle ran."""
    if not _COMMANDS:
        return None
    return {"screen": dict(_SCREEN), "commands": list(_COMMANDS)}
